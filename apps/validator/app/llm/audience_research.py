"""Módulo Audience Research (Jobs-to-be-Done).

Modela la **demanda** de un producto: dado un producto y, opcionalmente, una
pista de audiencia e insights reales, identifica segmentos y, para cada uno, la
situación que dispara la búsqueda de una solución, sus Jobs-to-be-Done
(funcional, emocional, social) y los insights accionables.

Sigue el mismo patrón que ``app.llm.profiles``: una interfaz (Protocol) con dos
implementaciones — ``ClaudeAudienceResearcher`` (real) y
``HeuristicAudienceResearcher`` (fallback offline determinista) — y una fábrica
``get_audience_researcher()`` que elige según ``ANTHROPIC_API_KEY``.

**Regla de oro:** siempre debe existir el fallback heurístico, para que el
endpoint funcione sin red ni clave (tests y CI incluidos).
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from app.llm import client as llm_client
from app.utils.logging import get_logger

logger = get_logger(__name__)

#: Claves que componen cada segmento (contrato con el frontend / schema).
SEGMENT_KEYS = (
    "segment",
    "is_hypothesis",
    "trigger_situation",
    "trigger_event",
    "best_timing",
    "job_functional",
    "job_emotional",
    "job_social",
    "sales_questions",
    "support_frustrations",
    "social_listening",
    "main_pain",
    "main_desire",
    "evidence",
)

#: Plantillas JTBD deterministas para el generador heurístico (offline).
_SEGMENT_TEMPLATES = [
    {
        "segment": "Profesional independiente en crecimiento",
        "trigger_situation": "Cuando el volumen de trabajo supera lo que puede gestionar a mano",
        "trigger_event": "Un pico de clientes o un error costoso por falta de control",
        "best_timing": "Inicio de mes y cierre trimestral (planificación y balance)",
        "job_functional": "Tener bajo control sus números y procesos sin perder horas",
        "job_emotional": "Sentirse en control y reducir la ansiedad de improvisar",
        "job_social": "Ser percibido como un profesional serio y confiable",
        "sales_questions": "¿Cuánto tiempo me ahorra? ¿Se integra con lo que ya uso? ¿Es seguro?",
        "support_frustrations": "Configuración inicial confusa y migración de datos",
        "social_listening": "En foros y X piden 'algo simple que no requiera ser experto'",
        "main_pain": "Perder tiempo y dinero en tareas manuales propensas a error",
        "main_desire": "Automatizar lo tedioso y enfocarse en su oficio",
    },
    {
        "segment": "Equipo pequeño que escala",
        "trigger_situation": "Cuando coordinar a varias personas con herramientas dispersas se vuelve caótico",
        "trigger_event": "Una nueva contratación o un cliente grande que exige procesos",
        "best_timing": "Lunes por la mañana (planificación semanal del equipo)",
        "job_functional": "Estandarizar el trabajo y tener visibilidad compartida",
        "job_emotional": "Confiar en que nada se cae entre las grietas",
        "job_social": "Proyectar una operación profesional ante clientes e inversores",
        "sales_questions": "¿Cuántos usuarios incluye? ¿Hay permisos por rol? ¿Soporte en español?",
        "support_frustrations": "Onboarding del equipo y curva de aprendizaje",
        "social_listening": "En Reddit comparan alternativas y temen el 'lock-in'",
        "main_pain": "Falta de coordinación y retrabajo entre miembros",
        "main_desire": "Una única fuente de verdad para todo el equipo",
    },
    {
        "segment": "Escéptico orientado al retorno",
        "trigger_situation": "Cuando evalúa si una nueva herramienta justifica su coste",
        "trigger_event": "Recorte de presupuesto o presión por demostrar resultados",
        "best_timing": "Ciclos de renovación o revisión de gastos",
        "job_functional": "Maximizar el retorno con el mínimo coste y riesgo",
        "job_emotional": "Evitar el arrepentimiento de una mala compra",
        "job_social": "Ser visto como alguien que decide con datos, no por moda",
        "sales_questions": "¿Cuál es el ROI? ¿Puedo cancelar cuando quiera? ¿Hay prueba real?",
        "support_frustrations": "Promesas de marketing que no se cumplen en el uso real",
        "social_listening": "Busca reseñas independientes y casos con cifras concretas",
        "main_pain": "Desconfianza tras herramientas que prometieron y no entregaron",
        "main_desire": "Evidencia tangible de valor antes de comprometerse",
    },
    {
        "segment": "Adoptante temprano entusiasta",
        "trigger_situation": "Cuando descubre una solución novedosa a un problema que ya sentía",
        "trigger_event": "Un lanzamiento o recomendación en su comunidad",
        "best_timing": "Cualquier momento; reacciona rápido a lo nuevo",
        "job_functional": "Resolver el problema con la mejor herramienta disponible",
        "job_emotional": "Sentir que va por delante y experimenta",
        "job_social": "Ser referente que recomienda novedades a su red",
        "sales_questions": "¿Qué la hace diferente? ¿Tiene roadmap? ¿Puedo dar feedback?",
        "support_frustrations": "Falta de funciones avanzadas o de comunidad activa",
        "social_listening": "Comparte hallazgos en X y foros de nicho con detalle",
        "main_pain": "Aburrimiento con soluciones genéricas y lentas",
        "main_desire": "Estar a la vanguardia y moldear el producto",
    },
]


@runtime_checkable
class AudienceResearcher(Protocol):
    """Contrato para los investigadores de audiencia (JTBD)."""

    source: str

    def research(
        self,
        product: str,
        audience_hint: str | None = None,
        insights_raw: str | None = None,
    ) -> dict[str, Any]:
        """Devuelve ``{"summary": str, "segments": [...], "source": str}``."""
        ...


# ---------------------------------------------------------------------------
# Implementación heurística (offline, determinista)
# ---------------------------------------------------------------------------


class HeuristicAudienceResearcher:
    """Investigador determinista sin dependencias externas (fallback)."""

    source = "heuristic"

    def research(
        self,
        product: str,
        audience_hint: str | None = None,
        insights_raw: str | None = None,
    ) -> dict[str, Any]:
        has_insights = bool(insights_raw and insights_raw.strip())
        evidence = (
            insights_raw.strip().splitlines()[0][:200] if has_insights else "hipótesis"
        )

        # 2-4 segmentos. Si hay pista de audiencia, se prioriza el primero.
        templates = list(_SEGMENT_TEMPLATES)
        n = 3 if not has_insights else 4
        segments: list[dict[str, Any]] = []
        for tpl in templates[:n]:
            seg = dict(tpl)
            if audience_hint:
                seg["segment"] = f"{tpl['segment']} ({audience_hint.strip()})"
            seg["is_hypothesis"] = not has_insights
            seg["evidence"] = evidence
            segments.append(seg)

        summary = (
            f"La demanda de «{product.strip()[:80]}» se concentra en segmentos que "
            "buscan control, retorno y simplicidad."
            + (
                " Basado en los insights aportados."
                if has_insights
                else " Segmentos hipotéticos (sin insights reales aportados)."
            )
        )
        return {"summary": summary, "segments": segments, "source": self.source}


# ---------------------------------------------------------------------------
# Implementación con Claude
# ---------------------------------------------------------------------------

_SYSTEM = (
    "Eres un investigador de mercado experto en Jobs-to-be-Done y psicología del "
    "consumidor. Respondes SIEMPRE con JSON válido, sin texto adicional, en español."
)

_INSTRUCTIONS = """Recibirás un producto/servicio y, opcionalmente, una hipótesis de \
audiencia e insights reales (conversaciones de ventas, soporte o redes). Tu tarea es \
modelar la DEMANDA: identifica los segmentos de audiencia y, para cada uno, las \
situaciones que disparan la búsqueda de una solución como esta, sus Jobs-to-be-Done \
(funcional, emocional, social) y los insights accionables.

Reglas de evidencia:
- Si recibes "INSIGHTS REALES", BÁSATE en ellos y cítalos textualmente en "evidence".
- Lo que no esté respaldado por datos márcalo como hipótesis ("evidence": "hipótesis",
  "is_hypothesis": true).
- Nunca inventes citas de clientes. Si no hay datos, infiere y dilo explícitamente.
- Sé concreto a ESTE producto y ESTE segmento, no genérico.
- Devuelve entre 2 y 4 segmentos."""

_SCHEMA = """{
  "summary": "Una oración con el insight de demanda más importante",
  "segments": [
    {
      "segment": "Nombre del segmento de audiencia",
      "is_hypothesis": true,
      "trigger_situation": "En qué situación busca una solución como la tuya",
      "trigger_event": "Evento o cambio en su vida/negocio que lo motiva",
      "best_timing": "Momento del día/semana/mes en que es más receptivo",
      "job_functional": "La tarea práctica que necesita completar",
      "job_emotional": "Cómo quiere sentirse al usar la solución",
      "job_social": "Cómo desea ser percibido por los demás",
      "sales_questions": "Preguntas típicas en una conversación de ventas",
      "support_frustrations": "Fricciones recurrentes que mencionaría en soporte",
      "social_listening": "Qué se dice del sector/producto en Reddit, X, foros",
      "main_pain": "Su punto de dolor principal",
      "main_desire": "Su deseo principal",
      "evidence": "Cita textual del insight real, o 'hipótesis'"
    }
  ]
}"""


class ClaudeAudienceResearcher:
    """Investigador de audiencia basado en la API de Claude."""

    source = "claude"

    def __init__(self, client: llm_client.ClaudeClient | None = None):
        self._client = client or llm_client.ClaudeClient()
        self._fallback = HeuristicAudienceResearcher()

    def research(
        self,
        product: str,
        audience_hint: str | None = None,
        insights_raw: str | None = None,
    ) -> dict[str, Any]:
        lines = [f"PRODUCTO O SERVICIO: {product}"]
        if audience_hint:
            lines.append(f"HIPÓTESIS DE AUDIENCIA: {audience_hint}")
        if insights_raw:
            lines.append(f"INSIGHTS REALES:\n{insights_raw}")
        prompt = (
            f"{_INSTRUCTIONS}\n\n{chr(10).join(lines)}\n\n"
            f"Devuelve EXACTAMENTE este JSON:\n{_SCHEMA}"
        )
        try:
            data = self._client.complete_json(_SYSTEM, prompt, max_tokens=2500)
            segments = data.get("segments") if isinstance(data, dict) else None
            if not segments:
                raise ValueError("Respuesta sin segmentos.")
            return {
                "summary": data.get("summary", ""),
                "segments": segments,
                "source": self.source,
            }
        except Exception as exc:  # noqa: BLE001 - fallback robusto
            logger.warning(
                "Fallo en Audience Research con Claude (%s). Uso heurística.", exc
            )
            return self._fallback.research(product, audience_hint, insights_raw)


# ---------------------------------------------------------------------------
# Fábrica
# ---------------------------------------------------------------------------


def get_audience_researcher() -> AudienceResearcher:
    """Devuelve el investigador disponible (Claude si hay clave; si no, heurístico)."""
    if llm_client.is_available():
        try:
            return ClaudeAudienceResearcher()
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo inicializar Claude (%s). Uso heurística.", exc)
    return HeuristicAudienceResearcher()
