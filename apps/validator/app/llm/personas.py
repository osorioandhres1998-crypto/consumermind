"""Panel de personas sintéticas que responden a la propuesta (Fase 1.3).

Sustituye las tres objeciones fijas del Monte Carlo v1 (artefactos del
modelo) por respuestas específicas al producto: cada arquetipo "lee" la
propuesta y contesta como lo haría en una entrevista corta. La evidencia
académica sobre encuestas con personas sintéticas (LLM) es clara en dos
cosas: correlacionan moderadamente con encuestas reales en el ORDEN
(qué segmento responde mejor, qué objeción domina), y NO son fiables en
el nivel absoluto. Por eso la salida se presenta como ranking de
objeciones y señal relativa, nunca como "X % comprará".

Una sola llamada batched (todas las personas en un JSON) para contener
coste y latencia. Mismo patrón que ``profiles.py``: Claude + heurístico.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from app.llm import client as llm_client
from app.utils.logging import get_logger

logger = get_logger(__name__)

#: Taxonomía cerrada de objeciones para poder agregar entre personas.
OBJECTION_CATEGORIES: dict[str, str] = {
    "precio": "El precio no compensa lo que recibo",
    "valor_no_claro": "No entiendo qué gano concretamente",
    "confianza": "No confío en que funcione o en quién lo ofrece",
    "no_es_prioridad": "El problema existe pero no es urgente para mí",
    "cambio_de_habito": "Me cuesta cambiar cómo lo hago hoy",
    "alternativa_suficiente": "Lo que uso ahora ya me sirve",
    "otro": "Otra razón",
}

INTENT_LABELS = {
    1: "No lo compraría",
    2: "Probablemente no",
    3: "Tal vez, con dudas",
    4: "Probablemente sí",
    5: "Lo compraría ya",
}


def _clamp_intent(v: Any) -> int:
    try:
        return int(min(5, max(1, round(float(v)))))
    except (TypeError, ValueError):
        return 3


def _category(v: Any) -> str:
    key = str(v or "").strip().lower()
    return key if key in OBJECTION_CATEGORIES else "otro"


def normalize_response(raw: dict[str, Any], archetype: dict[str, Any]) -> dict[str, Any]:
    """Sanea una respuesta (LLM o heurística) contra el arquetipo de origen."""
    raw = raw or {}
    return {
        "persona": archetype.get("name") or raw.get("persona") or "Persona",
        "segment_share": float(archetype.get("segment_share", 0.0) or 0.0),
        "intent": _clamp_intent(raw.get("intent")),
        "first_reaction": str(raw.get("first_reaction") or "").strip(),
        "main_objection": str(raw.get("main_objection") or "").strip(),
        "objection_category": _category(raw.get("objection_category")),
        "what_would_convince": str(raw.get("what_would_convince") or "").strip(),
        "question": str(raw.get("question") or "").strip(),
    }


def aggregate_panel(responses: list[dict[str, Any]], source: str) -> dict[str, Any]:
    """Agrega las respuestas ponderando por la cuota de cada segmento."""
    if not responses:
        return {"responses": [], "intent_mean": None, "top2box": None, "objections": [], "source": source}
    shares = [max(0.0, r["segment_share"]) for r in responses]
    total = sum(shares) or float(len(responses))
    w = [s / total if sum(shares) > 0 else 1.0 / len(responses) for s in shares]

    intent_mean = sum(wi * r["intent"] for wi, r in zip(w, responses, strict=True))
    top2box = sum(wi for wi, r in zip(w, responses, strict=True) if r["intent"] >= 4)

    by_cat: dict[str, float] = {}
    for wi, r in zip(w, responses, strict=True):
        if r["intent"] <= 3:  # solo cuentan las objeciones de quien NO compraría claramente
            by_cat[r["objection_category"]] = by_cat.get(r["objection_category"], 0.0) + wi
    cat_total = sum(by_cat.values())
    objections = sorted(
        [
            {
                "category": c,
                "label": OBJECTION_CATEGORIES[c],
                "share": round(v / cat_total, 4) if cat_total else 0.0,
                "quotes": [
                    r["main_objection"]
                    for r in responses
                    if r["objection_category"] == c and r["intent"] <= 3 and r["main_objection"]
                ][:3],
            }
            for c, v in by_cat.items()
        ],
        key=lambda d: d["share"],
        reverse=True,
    )
    return {
        "responses": responses,
        "intent_mean": round(intent_mean, 2),
        "intent_label": INTENT_LABELS[_clamp_intent(intent_mean)],
        "top2box": round(top2box, 4),
        "objections": objections,
        "source": source,
        "note": (
            "Señal relativa: útil para saber qué segmento responde mejor y qué objeción "
            "domina. No es una estimación del porcentaje real de compra."
        ),
    }


@runtime_checkable
class PersonaPanel(Protocol):
    source: str

    def respond(
        self,
        idea: str,
        target_audience: str,
        archetypes: list[dict[str, Any]],
        *,
        price: str | None = None,
        alternatives: str | None = None,
        channel: str | None = None,
    ) -> dict[str, Any]: ...


# ---------------------------------------------------------------------------
# Heurístico (offline, determinista)
# ---------------------------------------------------------------------------


class HeuristicPersonaPanel:
    """Respuestas deterministas derivadas de los parámetros del arquetipo.

    No lee la idea: deriva la intención de ``adoption_prob_base`` y la
    objeción de ``price_sensitivity``/``key_drivers``. Deja claro en el texto
    que es una plantilla, para que nadie la confunda con una respuesta real.
    """

    source = "heuristic"

    def respond(
        self,
        idea: str,
        target_audience: str,
        archetypes: list[dict[str, Any]],
        *,
        price: str | None = None,
        alternatives: str | None = None,
        channel: str | None = None,
    ) -> dict[str, Any]:
        responses = []
        for a in archetypes or []:
            base = float(a.get("adoption_prob_base", 0.2) or 0.2)
            sens = float(a.get("price_sensitivity", 1.0) or 1.0)
            drivers = [str(d) for d in a.get("key_drivers", [])]
            intent = 1 + round(base * 4)
            if sens >= 1.5:
                cat = "precio"
            elif "confiabilidad" in drivers or "soporte" in drivers:
                cat = "confianza"
            elif base < 0.2:
                cat = "no_es_prioridad"
            else:
                cat = "valor_no_claro"
            responses.append(
                normalize_response(
                    {
                        "intent": intent,
                        "first_reaction": "(Plantilla sin IA) Reacción no disponible.",
                        "main_objection": f"(Plantilla) {OBJECTION_CATEGORIES[cat]}.",
                        "objection_category": cat,
                        "what_would_convince": "Evidencia concreta de resultados y una forma de probar sin riesgo.",
                        "question": "¿Cómo sé que esto funciona para alguien como yo?",
                    },
                    a,
                )
            )
        return aggregate_panel(responses, self.source)


# ---------------------------------------------------------------------------
# Claude
# ---------------------------------------------------------------------------

_SYSTEM = (
    "Simulas un panel de clientes potenciales en una entrevista corta. Cada persona "
    "responde EN PRIMERA PERSONA, con la voz, prioridades y escepticismo de su "
    "arquetipo. Los clientes reales son escépticos por defecto: la mayoría no compra "
    "a la primera, pide pruebas y compara con lo que ya usa. Está PROHIBIDO ser "
    "complaciente con la idea. Respondes SIEMPRE con JSON válido, en español."
)


def _build_prompt(
    idea: str,
    target_audience: str,
    archetypes: list[dict[str, Any]],
    price: str | None,
    alternatives: str | None,
    channel: str | None,
) -> str:
    lines = [f"PROPUESTA: {idea}", f"PÚBLICO OBJETIVO: {target_audience}"]
    if price:
        lines.append(f"PRECIO: {price}")
    if alternatives:
        lines.append(f"ALTERNATIVAS QUE USAN HOY: {alternatives}")
    if channel:
        lines.append(f"DÓNDE VERÍAN LA PROPUESTA: {channel}")

    def _persona_line(i: int, a: dict[str, Any]) -> str:
        line = (
            f"{i + 1}. {a.get('name', 'Persona')} — {a.get('description', '')} "
            f"(sensibilidad al precio {a.get('price_sensitivity', 1.0)}/3; "
            f"le importa: {', '.join(map(str, a.get('key_drivers', []))) or 'n/d'})"
        )
        j = a.get("jtbd") or {}
        if j:  # Fase 2.3: contexto JTBD para que la persona responda desde su situación real
            bits = [
                f"situación: {j['trigger_situation']}" if j.get("trigger_situation") else "",
                f"dolor: {j['main_pain']}" if j.get("main_pain") else "",
                f"desea: {j['main_desire']}" if j.get("main_desire") else "",
                f"job emocional: {j['job_emotional']}" if j.get("job_emotional") else "",
                f"suele preguntar: {j['sales_questions']}" if j.get("sales_questions") else "",
            ]
            line += "\n   JTBD → " + "; ".join(b for b in bits if b)
        return line

    personas = "\n".join(_persona_line(i, a) for i, a in enumerate(archetypes))
    cats = "\n".join(f'- "{k}": {v}' for k, v in OBJECTION_CATEGORIES.items())
    return (
        "\n".join(lines)
        + "\n\nPANEL (responde UNA vez por cada persona, en este orden):\n"
        + personas
        + "\n\nPara cada persona devuelve:\n"
        '- "intent": 1-5 (1 = no lo compraría, 3 = tal vez con dudas, 5 = lo compraría ya). '
        "Reserva el 5 para casos excepcionales; un panel realista tiene mayoría en 2-3.\n"
        '- "first_reaction": su primera reacción en 1 frase, en su propia voz.\n'
        '- "main_objection": su objeción principal, CONCRETA a esta propuesta y su situación '
        "(no genérica como 'es caro': di caro respecto a qué).\n"
        '- "objection_category": una de estas claves:\n'
        + cats
        + '\n- "what_would_convince": qué tendría que ver o probar para pasar al siguiente nivel.\n'
        '- "question": la pregunta que haría antes de decidir.\n\n'
        "Reglas: no inventes datos del producto que no estén en la propuesta; si falta "
        "información, la persona lo señala como objeción o pregunta.\n\n"
        'Devuelve EXACTAMENTE: {"responses": [{"persona": "...", "intent": 3, '
        '"first_reaction": "...", "main_objection": "...", "objection_category": "...", '
        '"what_would_convince": "...", "question": "..."}]}'
    )


class ClaudePersonaPanel:
    source = "claude"

    def __init__(self, client: llm_client.ClaudeClient | None = None):
        self._client = client or llm_client.ClaudeClient()
        self._fallback = HeuristicPersonaPanel()

    def respond(
        self,
        idea: str,
        target_audience: str,
        archetypes: list[dict[str, Any]],
        *,
        price: str | None = None,
        alternatives: str | None = None,
        channel: str | None = None,
    ) -> dict[str, Any]:
        if not archetypes:
            return aggregate_panel([], self.source)
        prompt = _build_prompt(idea, target_audience, archetypes, price, alternatives, channel)
        try:
            data = self._client.complete_json(_SYSTEM, prompt, max_tokens=3000, temperature=0.5)
            raw = data.get("responses") if isinstance(data, dict) else data
            if not isinstance(raw, list) or not raw:
                raise ValueError("Respuesta sin personas.")
            # Alinea por posición (el prompt fija el orden); si sobran/faltan, recorta.
            responses = [
                normalize_response(r if isinstance(r, dict) else {}, a)
                for r, a in zip(raw, archetypes, strict=False)
            ]
            return aggregate_panel(responses, self.source)
        except Exception as exc:  # noqa: BLE001 - fallback robusto
            logger.warning("Fallo en el panel de personas con Claude (%s). Uso heurística.", exc)
            return self._fallback.respond(
                idea, target_audience, archetypes, price=price, alternatives=alternatives, channel=channel
            )


def get_persona_panel() -> PersonaPanel:
    if llm_client.is_available():
        try:
            return ClaudePersonaPanel()
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo inicializar Claude (%s). Uso heurística.", exc)
    return HeuristicPersonaPanel()
