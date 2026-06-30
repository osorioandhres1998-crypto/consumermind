"""Núcleo de simulación Monte Carlo para validación de MVP.

Este módulo modela la reacción de una *audiencia simulada* frente a una idea
de producto. Cada "iteración" Monte Carlo genera una población de perfiles
virtuales que evalúan el producto en función de:

- una probabilidad base de adopción (``adoption_prob_base``),
- la percepción de un conjunto de características ponderadas (``feature_weights``),
- la sensibilidad al precio (``price_sensitivity``),
- y un término de ruido aleatorio (``noise_distribution``).

A partir de miles de iteraciones se estiman métricas agregadas con intervalos
de confianza al 95 %:

- ``acceptance_rate``: tasa de aceptación del mercado.
- ``purchase_intent_probability``: probabilidad de intención de compra.
- ``top_objections``: principales objeciones y su frecuencia.
- ``feature_importance``: sensibilidad de la adopción a cada característica.
- ``raw_samples``: muestras crudas por iteración (opcional, paginable).

El código es puramente numérico (numpy/pandas) y deja *hooks* preparados para
que, en futuras iteraciones, un LLM (Claude) genere los perfiles y las
respuestas textuales que hoy se modelan estadísticamente.
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np
from joblib import Parallel, delayed

from app.utils.logging import get_logger
from app.utils.parallel import chunk_indices, resolve_n_jobs
from app.utils.seed import spawn_child_seeds

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Configuración por defecto
# ---------------------------------------------------------------------------

#: Configuración por defecto sugerida en la documentación del proyecto.
DEFAULT_CONFIG: dict[str, Any] = {
    "n_iterations": 10000,
    "population_size": 1000,
    "adoption_prob_base": 0.2,
    "feature_weights": {
        "usabilidad": 1.0,
        "diseno": 0.7,
        "innovacion": 0.9,
        "soporte": 0.5,
        "confiabilidad": 0.8,
    },
    "price_sensitivity": 1.0,
    "noise_distribution": {"type": "normal", "params": {"loc": 0.0, "scale": 1.0}},
    "random_seed": 42,
    "include_raw_samples": True,
    "n_jobs": None,  # None => se resuelve automáticamente según n_iterations/CPU.
}

#: Etiquetas de objeciones generadas por el modelo estadístico.
OBJECTION_LABELS = ("precio_alto", "valor_percibido_bajo", "no_lo_necesita")


# ---------------------------------------------------------------------------
# Utilidades numéricas
# ---------------------------------------------------------------------------


def _expit(x: np.ndarray) -> np.ndarray:
    """Sigmoide numéricamente estable: 1 / (1 + e^-x)."""
    return 0.5 * (1.0 + np.tanh(0.5 * x))


def _logit(p: float) -> float:
    """Transformación logit con recorte para evitar infinitos."""
    p = float(np.clip(p, 1e-6, 1 - 1e-6))
    return float(np.log(p / (1.0 - p)))


def _sample_noise(
    rng: np.random.Generator,
    dist_type: str,
    params: dict[str, float],
    size: int,
) -> np.ndarray:
    """Genera ruido según la distribución solicitada.

    Distribuciones soportadas: ``normal``, ``uniform``, ``lognormal``,
    ``gumbel``. Cualquier otro valor levanta ``ValueError``.
    """
    dist_type = (dist_type or "normal").lower()
    params = params or {}
    if dist_type == "normal":
        return rng.normal(params.get("loc", 0.0), params.get("scale", 1.0), size)
    if dist_type == "uniform":
        return rng.uniform(params.get("low", -1.0), params.get("high", 1.0), size)
    if dist_type == "lognormal":
        mean = params.get("mean", 0.0)
        sigma = params.get("sigma", 1.0)
        # Se centra restando la media teórica para que actúe como ruido ~0.
        return rng.lognormal(mean, sigma, size) - float(np.exp(mean + sigma**2 / 2))
    if dist_type == "gumbel":
        return rng.gumbel(params.get("loc", 0.0), params.get("scale", 1.0), size)
    raise ValueError(f"Distribución de ruido no soportada: {dist_type!r}")


def _summary(values: np.ndarray, confidence: float = 0.95) -> dict[str, float]:
    """Resumen estadístico con intervalo de confianza al 95 %.

    Combina el CI por percentiles (estilo bootstrap sobre la distribución
    Monte Carlo de las iteraciones) con la desviación estándar y el error
    estándar de la media (CI analítico disponible para el consumidor).
    """
    arr = np.asarray(values, dtype=float)
    mean = float(arr.mean())
    std = float(arr.std(ddof=1)) if arr.size > 1 else 0.0
    sem = std / np.sqrt(arr.size) if arr.size > 1 else 0.0
    lower_pct = (1.0 - confidence) / 2.0 * 100.0
    upper_pct = (1.0 + confidence) / 2.0 * 100.0
    ci_lower, ci_upper = np.percentile(arr, [lower_pct, upper_pct])
    return {
        "mean": mean,
        "std": std,
        "sem": float(sem),
        "ci_95_lower": float(ci_lower),
        "ci_95_upper": float(ci_upper),
    }


# ---------------------------------------------------------------------------
# Iteración individual (vectorizada sobre la población)
# ---------------------------------------------------------------------------


def _run_single_iteration(
    seed: np.random.SeedSequence,
    population_size: int,
    base_logit: float,
    weights: np.ndarray,
    price_sensitivity: float,
    noise_type: str,
    noise_params: dict[str, float],
) -> dict[str, Any]:
    """Ejecuta una iteración Monte Carlo sobre toda la población.

    Cada perfil percibe las características en ``[0, 1]`` y declara (o no) la
    adopción y la intención de compra. El cálculo está totalmente vectorizado
    con numpy. Recibe una ``SeedSequence`` propia para garantizar
    reproducibilidad independientemente del nivel de paralelismo.
    """
    rng = np.random.default_rng(seed)
    n_features = weights.shape[0]

    # Percepción de cada característica por individuo, en [0, 1].
    perceptions = rng.random((population_size, n_features))
    # Utilidad de características centrada en 0.5 (los pesos actúan como
    # desviaciones respecto de una percepción neutra).
    feature_util = (perceptions - 0.5) @ weights

    # Percepción de la carga de precio (0 = barato, 1 = caro). Actúa como un
    # coste neto: a mayor sensibilidad/precio percibido, menor adopción.
    price_perception = rng.random(population_size)
    price_effect = price_sensitivity * price_perception

    noise = _sample_noise(rng, noise_type, noise_params, population_size)

    logit = base_logit + feature_util - price_effect + noise
    adoption_prob = _expit(logit)
    adopted = rng.random(population_size) < adoption_prob

    # Intención de compra: condicionada a la adopción y penalizada por el
    # precio percibido.
    purchase_prob = adoption_prob * (1.0 - 0.5 * price_perception)
    purchase_intent = rng.random(population_size) < purchase_prob

    acceptance_rate = float(adopted.mean())
    purchase_intent_rate = float(purchase_intent.mean())

    # --- Objeciones (solo para quienes NO adoptan) ---------------------------
    non_adopters = ~adopted
    objection_counts = np.zeros(len(OBJECTION_LABELS), dtype=np.int64)
    if non_adopters.any():
        # Puntuación de cada objeción: a mayor valor, más probable que sea el
        # motivo dominante del rechazo.
        score_precio = price_effect
        score_valor = -feature_util
        score_no_necesita = -(base_logit + noise)
        scores = np.vstack([score_precio, score_valor, score_no_necesita]).T
        dominant = scores[non_adopters].argmax(axis=1)
        counts = np.bincount(dominant, minlength=len(OBJECTION_LABELS))
        objection_counts = counts.astype(np.int64)

    # --- Sensibilidad por característica (correlación punto-biserial) ---------
    feature_corr = np.full(n_features, np.nan)
    if adopted.any() and not adopted.all():
        adopted_f = adopted.astype(float)
        ad_mean = adopted_f.mean()
        ad_std = adopted_f.std()
        for j in range(n_features):
            col = perceptions[:, j]
            col_std = col.std()
            if col_std > 0 and ad_std > 0:
                feature_corr[j] = float(
                    ((col - col.mean()) * (adopted_f - ad_mean)).mean()
                    / (col_std * ad_std)
                )

    dominant_objection = OBJECTION_LABELS[int(objection_counts.argmax())]

    return {
        "acceptance_rate": acceptance_rate,
        "purchase_intent_rate": purchase_intent_rate,
        "n_adopters": int(adopted.sum()),
        "objection_counts": objection_counts,
        "feature_corr": feature_corr,
        "dominant_objection": dominant_objection,
    }


def _run_chunk(
    seeds: list[np.random.SeedSequence],
    **kwargs: Any,
) -> list[dict[str, Any]]:
    """Procesa un grupo de iteraciones en un mismo worker (reduce overhead)."""
    return [_run_single_iteration(seed, **kwargs) for seed in seeds]


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------


def resolve_config(config: dict[str, Any] | None) -> dict[str, Any]:
    """Mezcla la configuración del usuario con los valores por defecto."""
    resolved = dict(DEFAULT_CONFIG)
    if config:
        resolved.update({k: v for k, v in config.items() if v is not None})
    if not resolved.get("feature_weights"):
        resolved["feature_weights"] = dict(DEFAULT_CONFIG["feature_weights"])
    return resolved


def run_simulation(config: dict[str, Any]) -> dict[str, Any]:
    """Ejecuta la simulación Monte Carlo y devuelve métricas agregadas.

    Parameters
    ----------
    config:
        Diccionario con la configuración de la simulación. Claves aceptadas:
        ``n_iterations``, ``population_size``, ``adoption_prob_base``,
        ``feature_weights`` (dict), ``price_sensitivity``,
        ``noise_distribution`` (``{"type": ..., "params": {...}}``),
        ``random_seed`` (opcional), ``include_raw_samples`` (bool),
        ``n_jobs`` (int|None).

    Returns
    -------
    dict
        Estructura con ``acceptance_rate``, ``purchase_intent_probability``,
        ``top_objections``, ``feature_importance``, ``execution_metrics``,
        ``config`` y, opcionalmente, ``raw_samples``.
    """
    cfg = resolve_config(config)

    n_iterations = int(cfg["n_iterations"])
    population_size = int(cfg["population_size"])
    adoption_prob_base = float(cfg["adoption_prob_base"])
    price_sensitivity = float(cfg["price_sensitivity"])
    random_seed = cfg.get("random_seed")
    include_raw_samples = bool(cfg.get("include_raw_samples", True))

    if n_iterations <= 0 or population_size <= 0:
        raise ValueError("n_iterations y population_size deben ser positivos.")

    feature_names = list(cfg["feature_weights"].keys())
    weights = np.asarray(list(cfg["feature_weights"].values()), dtype=float)
    base_logit = _logit(adoption_prob_base)

    noise_cfg = cfg["noise_distribution"] or {}
    noise_type = noise_cfg.get("type", "normal")
    noise_params = noise_cfg.get("params", {})

    n_jobs = resolve_n_jobs(cfg.get("n_jobs"), n_iterations)

    logger.info(
        "Iniciando simulación: n_iterations=%d population_size=%d n_jobs=%d seed=%s",
        n_iterations,
        population_size,
        n_jobs,
        random_seed,
    )
    start = time.perf_counter()

    # Una SeedSequence hija independiente por iteración => reproducibilidad
    # garantizada sin importar el número de workers.
    child_seeds = spawn_child_seeds(random_seed, n_iterations)

    iter_kwargs = dict(
        population_size=population_size,
        base_logit=base_logit,
        weights=weights,
        price_sensitivity=price_sensitivity,
        noise_type=noise_type,
        noise_params=noise_params,
    )

    if n_jobs == 1:
        iteration_results = [
            _run_single_iteration(seed, **iter_kwargs) for seed in child_seeds
        ]
    else:
        chunks = chunk_indices(n_iterations, n_jobs)
        nested = Parallel(n_jobs=n_jobs)(
            delayed(_run_chunk)(child_seeds[start_i:end_i], **iter_kwargs)
            for start_i, end_i in chunks
        )
        iteration_results = [item for chunk in nested for item in chunk]

    elapsed = time.perf_counter() - start

    # --- Agregación ----------------------------------------------------------
    acceptance = np.array([r["acceptance_rate"] for r in iteration_results])
    purchase = np.array([r["purchase_intent_rate"] for r in iteration_results])

    total_objections = np.sum([r["objection_counts"] for r in iteration_results], axis=0)
    objections_sum = int(total_objections.sum())
    top_objections = sorted(
        [
            {
                "objection": label,
                "count": int(count),
                "frequency": float(count / objections_sum) if objections_sum else 0.0,
            }
            for label, count in zip(OBJECTION_LABELS, total_objections, strict=True)
        ],
        key=lambda d: d["count"],
        reverse=True,
    )

    corr_matrix = np.vstack([r["feature_corr"] for r in iteration_results])
    mean_corr = np.nanmean(corr_matrix, axis=0)
    mean_corr = np.nan_to_num(mean_corr, nan=0.0)
    abs_sum = np.abs(mean_corr).sum()
    feature_importance = sorted(
        [
            {
                "feature": name,
                "sensitivity": float(mean_corr[i]),
                "importance": float(abs(mean_corr[i]) / abs_sum) if abs_sum else 0.0,
            }
            for i, name in enumerate(feature_names)
        ],
        key=lambda d: d["importance"],
        reverse=True,
    )

    result: dict[str, Any] = {
        "acceptance_rate": _summary(acceptance),
        "purchase_intent_probability": _summary(purchase),
        "top_objections": top_objections,
        "feature_importance": feature_importance,
        "execution_metrics": {
            "n_iterations": n_iterations,
            "population_size": population_size,
            "n_jobs": n_jobs,
            "random_seed": random_seed,
            "elapsed_seconds": round(elapsed, 4),
            "iterations_per_second": (
                round(n_iterations / elapsed, 2) if elapsed else None
            ),
            "noise_distribution": {"type": noise_type, "params": noise_params},
        },
        "config": cfg,
    }

    if include_raw_samples:
        result["raw_samples"] = [
            {
                "iteration": i,
                "acceptance_rate": r["acceptance_rate"],
                "purchase_intent_rate": r["purchase_intent_rate"],
                "n_adopters": r["n_adopters"],
                "dominant_objection": r["dominant_objection"],
            }
            for i, r in enumerate(iteration_results)
        ]
    else:
        result["raw_samples"] = []

    logger.info(
        "Simulación finalizada en %.3fs (%.0f it/s). acceptance=%.4f",
        elapsed,
        result["execution_metrics"]["iterations_per_second"] or 0,
        result["acceptance_rate"]["mean"],
    )
    return result
