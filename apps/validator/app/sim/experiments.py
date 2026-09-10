"""Recomendador de experimentos de validación (Fase 3.1).

Cierra el ciclo: el validator no termina en una cifra sino en CÓMO validar
de verdad. Determinista (sin LLM): elige experimentos según qué duda pesa
más en el resultado (sensibilidad del Monte Carlo v2), la objeción dominante
del panel y la confianza de la rúbrica. Cada experimento trae métrica
objetivo y umbral de éxito de referencia (benchmarks habituales de
pre-validación; calibrables en Fase 4).
"""

from __future__ import annotations

from typing import Any

# Catálogo: qué valida cada experimento, métrica, umbral y esfuerzo.
CATALOG: dict[str, dict[str, Any]] = {
    "interviews": {
        "name": "Entrevistas de problema (5-8)",
        "validates": ["problem_severity", "problem_frequency", "alternatives_weakness"],
        "metric": "% que describe el problema sin que se lo sugieras y cuenta qué hace hoy para resolverlo",
        "threshold": "≥ 60 % lo menciona espontáneamente y ≥ 40 % ya gasta tiempo o dinero en resolverlo",
        "effort": "1 semana · $0",
        "how": "Guion de 20 min sobre su última vez con el problema; nada de presentar la solución.",
    },
    "smoke_landing": {
        "name": "Smoke test de landing",
        "validates": ["differentiation", "channel_access", "timing"],
        "metric": "Conversión de visita a registro/lista de espera con tráfico pagado del canal previsto",
        "threshold": "≥ 5 % en tráfico frío (≥ 10 % es señal fuerte) con ≥ 200 visitas",
        "effort": "1-2 semanas · $100-300 en ads",
        "how": "Landing con la promesa y el precio reales; audítala con Landing Analyzer antes de pagar tráfico.",
    },
    "fake_door": {
        "name": "Fake door / pre-venta",
        "validates": ["willingness_to_pay"],
        "metric": "% que llega al paso de pago (o paga un depósito reembolsable) tras ver el precio",
        "threshold": "≥ 2 % de visitas hace clic en 'comprar' · ≥ 1 % completa la pre-venta",
        "effort": "1 semana · sobre la landing del smoke test",
        "how": "Botón de compra real con el precio propuesto; si no hay producto, explica y reembolsa.",
    },
    "price_test": {
        "name": "Test de precio (Van Westendorp o 2 variantes)",
        "validates": ["willingness_to_pay"],
        "metric": "Rango de precio aceptable y conversión por variante",
        "threshold": "El precio propuesto cae dentro del rango 'ni caro ni barato' de ≥ 50 % de la muestra",
        "effort": "1 semana · encuesta a ≥ 30 personas del segmento",
        "how": "4 preguntas de Van Westendorp, o A/B con dos precios en la landing.",
    },
    "concierge": {
        "name": "Concierge / servicio manual",
        "validates": ["alternatives_weakness", "cambio_de_habito", "confianza"],
        "metric": "Retención: % que vuelve a usarlo o pide continuar tras la primera entrega",
        "threshold": "≥ 40 % pide seguir · al menos 3 clientes pagan algo",
        "effort": "2-4 semanas · tu tiempo",
        "how": "Entrega el resultado a mano a 5 clientes antes de construir nada.",
    },
    "channel_test": {
        "name": "Test de canal",
        "validates": ["channel_access"],
        "metric": "CPC/CPL real del canal previsto vs. margen por cliente",
        "threshold": "CAC estimado ≤ 1/3 del valor del primer año del cliente",
        "effort": "1 semana · $100-200",
        "how": "Campaña pequeña con 2-3 creatividades; usa la Calculadora de Rentabilidad con el CPL real.",
    },
}

# Objeción dominante del panel → experimento que la desmonta o la confirma.
OBJECTION_TO_EXPERIMENT = {
    "precio": "price_test",
    "valor_no_claro": "smoke_landing",
    "confianza": "concierge",
    "no_es_prioridad": "interviews",
    "cambio_de_habito": "concierge",
    "alternativa_suficiente": "interviews",
}


def recommend_experiments(
    rubric: dict[str, Any] | None,
    v2: dict[str, Any] | None,
    panel: dict[str, Any] | None,
    *,
    has_price: bool,
) -> dict[str, Any]:
    """Devuelve 3-4 experimentos ordenados por prioridad, con la razón de cada uno."""
    picks: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(key: str, reason: str) -> None:
        if key in seen or key not in CATALOG:
            return
        seen.add(key)
        picks.append({"key": key, **CATALOG[key], "reason": reason})

    confidence = (rubric or {}).get("confidence", "baja")
    sources = (rubric or {}).get("evidence_sources") or []

    # 1) Sin evidencia real del usuario, lo primero es hablar con clientes.
    if "usuario" not in sources:
        add("interviews", "No hay evidencia real de clientes: nada sustituye 5-8 conversaciones antes de gastar en tráfico.")

    # 2) La duda que más mueve la adopción decide el siguiente experimento.
    for s in (v2 or {}).get("sensitivity", [])[:2]:
        dim = s.get("key")
        for key, exp in CATALOG.items():
            if dim in exp["validates"]:
                if key == "fake_door" and not has_price:
                    key = "price_test"
                add(key, f"«{s.get('label', dim)}» es la duda que más mueve el resultado ({round(s.get('importance', 0) * 100)} % de la sensibilidad).")
                break

    # 3) La objeción dominante del panel.
    objections = (panel or {}).get("objections") or []
    if objections:
        top = objections[0]
        key = OBJECTION_TO_EXPERIMENT.get(top.get("category"), "interviews")
        add(key, f"La objeción dominante del panel es «{top.get('label')}» ({round(top.get('share', 0) * 100)} % de quienes no comprarían).")

    # 4) Siempre cerrar con la prueba de pago si hay precio y aún no está.
    if has_price:
        add("fake_door", "Hay precio propuesto: la única validación real de la disposición a pagar es intentar cobrar.")
    else:
        add("price_test", "Sin precio definido, la disposición a pagar sigue siendo pura hipótesis.")

    picks = picks[:4]
    for i, p in enumerate(picks, start=1):
        p["priority"] = i
    return {
        "experiments": picks,
        "sequence_note": (
            "Corre los experimentos en este orden: cada uno reduce la incertidumbre del siguiente. "
            "Registra el resultado real en el proyecto para calibrar el modelo (Fase 4)."
        ),
        "confidence_in": confidence,
    }
