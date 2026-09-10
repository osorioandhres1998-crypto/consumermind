"""Priors de adopción por vertical (Fase 2.1).

El Monte Carlo v2 arranca de un prior ``P0``: la adopción esperada de una
idea *neutra* (utilidad 0.5 en la rúbrica) entre la audiencia objetivo
expuesta a la propuesta. Hasta ahora era un 20 % fijo para cualquier
negocio. Aquí se ajusta por vertical, con la misma filosofía que
``apps/web/lib/benchmarks-verticales.js`` (MER, LTV/CAC, payback): valores
de **referencia consultiva**, rangos habituales por ciclo de compra y modelo
de ingresos, pensados para calibrarse con datos reales del workspace en la
Fase 4. No son verdades empíricas del mercado del usuario.

Cada vertical fija:
- ``p0``: prior de adopción de una idea neutra.
- ``price_k``: cuánto pesa la carga del precio en el logit (mayor = más
  sensible). E-commerce (ticket bajo, compra impulsiva) es más sensible al
  precio que servicios (ticket alto, decide por confianza).
- ``k``: pendiente rúbrica → adopción (qué tanto separa una idea buena de
  una mala). En verticales de decisión larga la rúbrica discrimina menos.
"""

from __future__ import annotations

from typing import Any

GENERIC_KEY = "generico"

VERTICAL_PRIORS: dict[str, dict[str, Any]] = {
    "ecommerce": {
        "label": "E-commerce",
        "p0": 0.24,
        "price_k": 1.7,
        "k": 4.2,
        "note": "Ciclo de compra corto y ticket bajo/medio: más gente prueba, pero el precio pesa más.",
    },
    "saas": {
        "label": "SaaS",
        "p0": 0.17,
        "price_k": 1.3,
        "k": 4.0,
        "note": "Adoptar implica cambiar de hábito o integrar: menos prueban, y el valor pesa más que el precio.",
    },
    "servicios": {
        "label": "Servicios / Agencia",
        "p0": 0.12,
        "price_k": 1.1,
        "k": 3.6,
        "note": "Ticket alto y decisión larga: la confianza domina; pocos adoptan a la primera.",
    },
    GENERIC_KEY: {
        "label": "Genérico (sin vertical)",
        "p0": 0.20,
        "price_k": 1.5,
        "k": 4.0,
        "note": "Sin vertical se usa el prior genérico: elige uno para afinar la estimación.",
    },
}


#: Fase 4 — peso del prior de referencia expresado en "observaciones equivalentes".
#: Con 5 resultados reales, el dato del workspace ya pesa lo mismo que la tabla.
PRIOR_PSEUDO_N = 5.0


def resolve_prior(vertical: str | None, calibration: dict[str, Any] | None = None) -> dict[str, Any]:
    """Devuelve el prior del vertical (o el genérico), con la clave usada.

    Fase 4: si hay ``calibration`` (``{"n", "observed_mean"}`` de resultados
    reales del workspace), el prior se actualiza con una media ponderada
    Beta-binomial: p0' = (N0·p0 + n·observado) / (N0 + n).
    """
    key = str(vertical or "").strip().lower()
    if key not in VERTICAL_PRIORS:
        key = GENERIC_KEY
    prior = {"vertical": key, **VERTICAL_PRIORS[key], "calibrated_n": 0}
    n = float((calibration or {}).get("n") or 0)
    if n > 0:
        obs = float(calibration["observed_mean"])
        p0 = (PRIOR_PSEUDO_N * prior["p0"] + n * obs) / (PRIOR_PSEUDO_N + n)
        prior["p0_reference"] = prior["p0"]
        prior["p0"] = round(min(0.95, max(0.01, p0)), 4)
        prior["calibrated_n"] = int(n)
        prior["note"] = (
            f"Prior calibrado con {int(n)} resultado(s) real(es) de tu workspace "
            f"(media observada {obs:.0%}); referencia del vertical: {prior['p0_reference']:.0%}."
        )
    return prior
