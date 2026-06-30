"""Traduce una idea de producto en una configuración de simulación.

Usa un ``ProfileGenerator`` (Claude o heurístico) para obtener arquetipos de
audiencia y los agrega en una única configuración consumible por
``run_simulation``: los ``feature_weights`` y demás parámetros resultan de la
media ponderada por la cuota de cada segmento (``segment_share``).
"""

from __future__ import annotations

from typing import Any

from app.llm.profiles import ProfileGenerator, get_profile_generator
from app.utils.logging import get_logger

logger = get_logger(__name__)


def _normalize_shares(archetypes: list[dict[str, Any]]) -> list[float]:
    shares = [max(0.0, float(a.get("segment_share", 0.0))) for a in archetypes]
    total = sum(shares)
    if total <= 0:
        # Reparto uniforme si no hay cuotas válidas.
        return [1.0 / len(archetypes)] * len(archetypes)
    return [s / total for s in shares]


def aggregate_archetypes(archetypes: list[dict[str, Any]]) -> dict[str, Any]:
    """Combina los arquetipos en parámetros agregados ponderados por cuota."""
    shares = _normalize_shares(archetypes)

    # Unión de todas las características presentes en los arquetipos.
    feature_keys: list[str] = []
    for a in archetypes:
        for k in a.get("feature_weights", {}):
            if k not in feature_keys:
                feature_keys.append(k)

    feature_weights = {k: 0.0 for k in feature_keys}
    price_sensitivity = 0.0
    adoption_prob_base = 0.0
    for a, share in zip(archetypes, shares, strict=True):
        weights = a.get("feature_weights", {})
        for k in feature_keys:
            feature_weights[k] += share * float(weights.get(k, 0.0))
        price_sensitivity += share * float(a.get("price_sensitivity", 1.0))
        adoption_prob_base += share * float(a.get("adoption_prob_base", 0.2))

    # Recorte a rangos válidos.
    adoption_prob_base = min(max(adoption_prob_base, 0.01), 0.99)
    price_sensitivity = max(price_sensitivity, 0.0)
    return {
        "feature_weights": feature_weights,
        "price_sensitivity": round(price_sensitivity, 4),
        "adoption_prob_base": round(adoption_prob_base, 4),
    }


def build_simulation_plan(
    idea: str,
    target_audience: str,
    n_archetypes: int = 8,
    simulation_overrides: dict[str, Any] | None = None,
    generator: ProfileGenerator | None = None,
) -> dict[str, Any]:
    """Construye el plan completo: arquetipos + configuración de simulación.

    Returns
    -------
    dict
        ``{"config": {...}, "archetypes": [...], "source": "claude"|"heuristic"}``.
    """
    generator = generator or get_profile_generator()
    archetypes = generator.generate_profiles(idea, target_audience, n_archetypes)
    aggregated = aggregate_archetypes(archetypes)

    config: dict[str, Any] = {
        "n_iterations": 10000,
        "population_size": 1000,
        "noise_distribution": {"type": "normal", "params": {"loc": 0.0, "scale": 1.0}},
        "random_seed": 42,
        "include_raw_samples": True,
        **aggregated,
    }
    if simulation_overrides:
        config.update({k: v for k, v in simulation_overrides.items() if v is not None})

    logger.info(
        "Plan construido (source=%s, %d arquetipos, %d características).",
        getattr(generator, "source", "unknown"),
        len(archetypes),
        len(aggregated["feature_weights"]),
    )
    return {
        "config": config,
        "archetypes": archetypes,
        "source": getattr(generator, "source", "unknown"),
    }
