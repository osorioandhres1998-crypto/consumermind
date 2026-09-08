"""Monte Carlo v2 — propagación de incertidumbre epistémica (Fase 1.2).

Diferencia de fondo con ``monte_carlo.py`` (v1):

- v1 muestreaba *percepciones aleatorias uniformes* de 1.000 personas por
  iteración. Ese ruido no representa nada del producto, y su intervalo de
  confianza solo mide la varianza del muestreo interno (falsa precisión).
- v2 muestrea, en cada iteración, **los parámetros que no conocemos**: las
  dimensiones de la rúbrica (``low``/``score``/``high`` → distribución PERT).
  La dispersión del resultado refleja lo que el evaluador declaró no saber.
  Sin ruido de población: la expectativa por segmento es determinista dado
  el escenario, y la incertidumbre es toda epistémica.

Modelo por iteración ``i``:

1. ``d_k ~ PERT(low_k, score_k, high_k)`` para cada dimensión ``k``.
2. Utilidad de la idea ``U_i`` = media ponderada de ``d_k`` (pesos de la rúbrica).
3. Adopción base ``p_i = expit(K·(U_i − 0.5) + logit(P0))``: con ``U=0.5`` la
   adopción es el prior ``P0`` (Fase 2.1 lo reemplazará por un prior por
   vertical); ``K`` controla cuánto separa la rúbrica a una idea buena de
   una mala.
4. Por segmento ``s``: ``p_{s,i} = expit(logit(p_i) + offset_s − PRICE_K·sens_s·carga_i)``,
   donde ``offset_s`` es la propensión relativa del arquetipo respecto al
   baseline y ``carga_i = 1 − wtp_i`` (disposición a pagar muestreada) es la
   carga del precio (0 = encaja, 1 = demasiado caro).
5. Adopción de la población = Σ share_s · p_{s,i}. Sin promediar arquetipos
   antes de simular: cada segmento vive su propia curva.
6. Intención de compra = adopción · (0.4 + 0.6·wtp_i).

Salidas: distribución de adopción e intención (percentiles, no "IC 95 %"),
adopción por segmento, curva precio-adopción (si hay precio numérico) y
sensibilidad: correlación entre cada dimensión muestreada y la adopción —
es decir, **qué duda pesa más**, para saber qué validar primero.
"""

from __future__ import annotations

import re
import time
from typing import Any

import numpy as np

from app.llm.rubric import DIMENSIONS
from app.sim.priors import resolve_prior
from app.utils.logging import get_logger

logger = get_logger(__name__)

# --- Supuestos del modelo (explícitos y ajustables) ---------------------------
#: P0 (prior de adopción de una idea neutra), K (pendiente rúbrica → adopción)
#: y PRICE_K (peso del precio en el logit) se resuelven POR VERTICAL en
#: ``app.sim.priors`` (Fase 2.1). Sin vertical: P0=0.20, K=4.0, PRICE_K=1.5.
#: Cambio de carga de precio por cada duplicación del precio (elasticidad).
PRICE_LOAD_PER_DOUBLING = 0.35
#: Multiplicadores para la curva precio-adopción.
PRICE_MULTIPLIERS = (0.5, 0.75, 1.0, 1.25, 1.5, 2.0)
#: Forma de la PERT (λ=4 es la PERT clásica).
PERT_LAMBDA = 4.0
#: Baseline con el que se compara ``adoption_prob_base`` de cada arquetipo.
ARCHETYPE_BASELINE = 0.20

_WEIGHTS = np.asarray([float(d["weight"]) for d in DIMENSIONS])
_KEYS = [d["key"] for d in DIMENSIONS]
_LABELS = {d["key"]: d["label"] for d in DIMENSIONS}
_WTP_INDEX = _KEYS.index("willingness_to_pay")


def _expit(x: np.ndarray | float) -> np.ndarray | float:
    return 0.5 * (1.0 + np.tanh(0.5 * np.asarray(x, dtype=float)))


def _logit(p: float) -> float:
    p = float(np.clip(p, 1e-6, 1 - 1e-6))
    return float(np.log(p / (1.0 - p)))


def sample_pert(
    rng: np.random.Generator, low: float, mode: float, high: float, size: int
) -> np.ndarray:
    """Muestras PERT en [low, high] con moda ``mode`` (Beta reparametrizada)."""
    low, mode, high = float(low), float(mode), float(high)
    span = high - low
    if span <= 1e-9:
        return np.full(size, mode)
    mode = min(max(mode, low), high)
    a = 1.0 + PERT_LAMBDA * (mode - low) / span
    b = 1.0 + PERT_LAMBDA * (high - mode) / span
    return low + span * rng.beta(a, b, size)


def parse_price(price: str | None) -> float | None:
    """Extrae el primer número de un texto de precio ("$29/mes" → 29.0)."""
    if not price:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", str(price))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


def _pct_summary(values: np.ndarray) -> dict[str, float]:
    pct = np.percentile(values, [5, 25, 50, 75, 95])
    return {
        "mean": round(float(values.mean()), 4),
        "p5": round(float(pct[0]), 4),
        "p25": round(float(pct[1]), 4),
        "p50": round(float(pct[2]), 4),
        "p75": round(float(pct[3]), 4),
        "p95": round(float(pct[4]), 4),
    }


def _normalize_shares(archetypes: list[dict[str, Any]]) -> np.ndarray:
    shares = np.asarray(
        [max(0.0, float(a.get("segment_share", 0.0))) for a in archetypes], dtype=float
    )
    total = shares.sum()
    if total <= 0:
        return np.full(len(archetypes), 1.0 / len(archetypes))
    return shares / total


def run_simulation_v2(
    rubric: dict[str, Any],
    archetypes: list[dict[str, Any]] | None,
    *,
    price: str | None = None,
    vertical: str | None = None,
    n_iterations: int = 10000,
    random_seed: int | None = 42,
) -> dict[str, Any]:
    """Ejecuta el Monte Carlo v2 y devuelve la distribución de resultados."""
    prior = resolve_prior(vertical)
    P0, K, PRICE_K = float(prior["p0"]), float(prior["k"]), float(prior["price_k"])
    if n_iterations <= 0:
        raise ValueError("n_iterations debe ser positivo.")
    dims = {d["key"]: d for d in rubric.get("dimensions", [])}
    if not dims:
        raise ValueError("La rúbrica no tiene dimensiones.")

    if not archetypes:
        archetypes = [{"name": "Audiencia", "segment_share": 1.0}]
    shares = _normalize_shares(archetypes)
    offsets = np.asarray(
        [
            _logit(float(a.get("adoption_prob_base", ARCHETYPE_BASELINE)))
            - _logit(ARCHETYPE_BASELINE)
            for a in archetypes
        ]
    )
    sens = np.asarray([max(0.0, float(a.get("price_sensitivity", 1.0))) for a in archetypes])

    rng = np.random.default_rng(random_seed)
    start = time.perf_counter()

    # 1) Muestreo de las dimensiones (n_iterations × n_dims).
    samples = np.column_stack(
        [
            sample_pert(
                rng,
                dims.get(k, {}).get("low", 0.5),
                dims.get(k, {}).get("score", 0.5),
                dims.get(k, {}).get("high", 0.5),
                n_iterations,
            )
            for k in _KEYS
        ]
    )

    # 2-3) Utilidad y adopción base.
    utility = samples @ _WEIGHTS / _WEIGHTS.sum()
    base_logit = K * (utility - 0.5) + _logit(P0)
    wtp = samples[:, _WTP_INDEX]

    def adoption_at(price_load: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Adopción por segmento (n_it × n_seg) y de la población (n_it)."""
        seg_logit = base_logit[:, None] + offsets[None, :] - PRICE_K * sens[None, :] * price_load[:, None]
        seg = _expit(seg_logit)
        return seg, seg @ shares

    # 4-5) Escenario base: carga de precio = 1 − disposición a pagar.
    base_load = np.clip(1.0 - wtp, 0.0, 1.0)
    seg_adoption, adoption = adoption_at(base_load)

    # 6) Intención de compra.
    purchase = adoption * (0.4 + 0.6 * wtp)

    # Curva precio-adopción (solo si el precio es numérico).
    price_value = parse_price(price)
    price_curve: list[dict[str, float]] = []
    if price_value is not None:
        for m in PRICE_MULTIPLIERS:
            load = np.clip(base_load + PRICE_LOAD_PER_DOUBLING * np.log2(m), 0.0, 1.0)
            _, adoption_m = adoption_at(load)
            price_curve.append(
                {
                    "multiplier": m,
                    "price": round(price_value * m, 2),
                    "adoption_mean": round(float(adoption_m.mean()), 4),
                    "adoption_p5": round(float(np.percentile(adoption_m, 5)), 4),
                    "adoption_p95": round(float(np.percentile(adoption_m, 95)), 4),
                }
            )

    # Sensibilidad: qué dimensión incierta mueve más la adopción.
    ad_std = adoption.std()
    corr = np.zeros(len(_KEYS))
    for j in range(len(_KEYS)):
        col = samples[:, j]
        if col.std() > 0 and ad_std > 0:
            corr[j] = float(np.corrcoef(col, adoption)[0, 1])
    abs_sum = float(np.abs(corr).sum())
    sensitivity = sorted(
        [
            {
                "key": k,
                "label": _LABELS[k],
                "correlation": round(float(corr[j]), 4),
                "importance": round(float(abs(corr[j]) / abs_sum), 4) if abs_sum else 0.0,
                "range_width": round(
                    float(dims.get(k, {}).get("high", 0.5) - dims.get(k, {}).get("low", 0.5)), 3
                ),
            }
            for j, k in enumerate(_KEYS)
        ],
        key=lambda d: d["importance"],
        reverse=True,
    )

    by_segment = [
        {
            "name": a.get("name") or f"Segmento {i + 1}",
            "share": round(float(shares[i]), 4),
            "adoption": _pct_summary(seg_adoption[:, i]),
        }
        for i, a in enumerate(archetypes)
    ]

    elapsed = time.perf_counter() - start
    result = {
        "adoption": _pct_summary(adoption),
        "purchase_intent": _pct_summary(purchase),
        "utility": _pct_summary(utility),
        "by_segment": by_segment,
        "price_curve": price_curve,
        "price_value": price_value,
        "sensitivity": sensitivity,
        "assumptions": {
            "vertical": prior["vertical"],
            "vertical_label": prior["label"],
            "vertical_note": prior["note"],
            "prior_adoption_p0": P0,
            "rubric_slope_k": K,
            "price_k": PRICE_K,
            "price_load_per_doubling": PRICE_LOAD_PER_DOUBLING,
            "note": (
                "La dispersión refleja la incertidumbre declarada en la rúbrica, no ruido "
                "de muestreo. Un rango ancho significa que faltan datos, no que el modelo "
                "sea impreciso."
            ),
        },
        "execution_metrics": {
            "n_iterations": int(n_iterations),
            "random_seed": random_seed,
            "elapsed_seconds": round(elapsed, 4),
        },
    }
    logger.info(
        "MC v2 finalizado en %.3fs: adopción p50=%.3f [p5=%.3f, p95=%.3f]",
        elapsed,
        result["adoption"]["p50"],
        result["adoption"]["p5"],
        result["adoption"]["p95"],
    )
    return result
