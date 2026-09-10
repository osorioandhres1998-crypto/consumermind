"""Generadores de perfiles de audiencia (arquetipos) y explicación de objeciones.

Define la interfaz ``ProfileGenerator`` y dos implementaciones:

- ``ClaudeProfileGenerator``: usa la API de Claude para generar arquetipos de
  audiencia realistas a partir de la idea y el público objetivo, y para
  redactar explicaciones de las objeciones en lenguaje natural.
- ``HeuristicProfileGenerator``: fallback determinista que NO requiere red ni
  clave de API. Garantiza que todo el flujo funcione offline y en CI.

La función ``get_profile_generator()`` elige automáticamente la implementación
disponible.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from app.llm import client as llm_client
from app.utils.logging import get_logger

logger = get_logger(__name__)

#: Vocabulario de características compartido (claves consistentes para agregar).
DEFAULT_FEATURES = ("usabilidad", "diseno", "innovacion", "soporte", "confiabilidad")

#: Plantillas de arquetipos para el generador heurístico (offline).
_ARCHETYPE_TEMPLATES = [
    {
        "name": "Adoptador temprano",
        "description": "Entusiasta de la innovación, dispuesto a probar lo nuevo.",
        "price_sensitivity": 0.6,
        "adoption_prob_base": 0.45,
        "drivers": ["innovacion", "diseno"],
    },
    {
        "name": "Pragmático sensible al precio",
        "description": "Busca valor claro y compara coste-beneficio antes de adoptar.",
        "price_sensitivity": 1.8,
        "adoption_prob_base": 0.2,
        "drivers": ["confiabilidad", "usabilidad"],
    },
    {
        "name": "Profesional ocupado",
        "description": "Prioriza la facilidad de uso y el ahorro de tiempo.",
        "price_sensitivity": 1.0,
        "adoption_prob_base": 0.3,
        "drivers": ["usabilidad", "soporte"],
    },
    {
        "name": "Escéptico cauto",
        "description": "Desconfía de promesas; necesita pruebas y soporte sólido.",
        "price_sensitivity": 1.3,
        "adoption_prob_base": 0.12,
        "drivers": ["confiabilidad", "soporte"],
    },
    {
        "name": "Optimizador de costes",
        "description": "Solo adopta si el retorno económico es evidente.",
        "price_sensitivity": 2.2,
        "adoption_prob_base": 0.15,
        "drivers": ["confiabilidad"],
    },
    {
        "name": "Creativo orientado al diseño",
        "description": "Valora la estética y la experiencia por encima del precio.",
        "price_sensitivity": 0.7,
        "adoption_prob_base": 0.35,
        "drivers": ["diseno", "innovacion"],
    },
    {
        "name": "Mayoría tardía",
        "description": "Adopta cuando la solución ya está validada por otros.",
        "price_sensitivity": 1.1,
        "adoption_prob_base": 0.18,
        "drivers": ["confiabilidad", "usabilidad"],
    },
    {
        "name": "Comprador empresarial",
        "description": "Decide por soporte, fiabilidad e integración, no por precio.",
        "price_sensitivity": 0.9,
        "adoption_prob_base": 0.28,
        "drivers": ["soporte", "confiabilidad"],
    },
]

_OBJECTION_RECOMMENDATIONS = {
    "precio_alto": (
        "El precio percibido frena la adopción. Considera un plan de entrada "
        "más económico, prueba gratuita o comunicar mejor el retorno de inversión."
    ),
    "valor_percibido_bajo": (
        "La propuesta de valor no termina de convencer. Refuerza el beneficio "
        "diferencial y aporta pruebas (casos de éxito, métricas) en el mensaje."
    ),
    "no_lo_necesita": (
        "Parte de la audiencia no percibe la necesidad. Trabaja la educación de "
        "mercado y segmenta hacia quienes ya sienten el problema de forma aguda."
    ),
}


#: Campos JTBD que viajan con el arquetipo (Fase 2.3) para dar contexto al
#: panel de personas sin arrastrar todo el segmento.
JTBD_FIELDS = (
    "trigger_situation", "trigger_event", "job_functional", "job_emotional",
    "job_social", "main_pain", "main_desire", "sales_questions", "is_hypothesis", "evidence",
)


def jtbd_link(segment: dict[str, Any]) -> dict[str, Any]:
    """Devuelve el enlace de un arquetipo con su segmento JTBD."""
    return {
        "jtbd_segment": segment.get("segment", ""),
        "jtbd": {k: segment.get(k) for k in JTBD_FIELDS if segment.get(k) is not None},
    }


@runtime_checkable
class ProfileGenerator(Protocol):
    """Contrato para generadores de perfiles de audiencia."""

    source: str

    def generate_profiles(
        self,
        idea: str,
        target_audience: str,
        n_profiles: int,
        segments: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """Devuelve una lista de arquetipos de audiencia (perfiles agregados).

        Fase 2.3: si se pasan ``segments`` (Audience Research / JTBD), cada
        arquetipo se construye SOBRE un segmento (uno por segmento) y conserva
        el enlace en ``jtbd_segment`` + ``jtbd`` (situación gatillo, jobs,
        dolor, deseo) para que el panel de personas responda con ese contexto.
        """
        ...

    def explain_objections(
        self,
        idea: str,
        objections: list[dict[str, Any]],
        metrics: dict[str, Any],
    ) -> dict[str, Any]:
        """Convierte objeciones/métricas en un resumen accionable."""
        ...


# ---------------------------------------------------------------------------
# Implementación heurística (offline, determinista)
# ---------------------------------------------------------------------------


class HeuristicProfileGenerator:
    """Generador determinista sin dependencias externas (fallback)."""

    source = "heuristic"

    def generate_profiles(
        self,
        idea: str,
        target_audience: str,
        n_profiles: int,
        segments: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        if segments:
            # Fase 2.3: un arquetipo por segmento JTBD; los parámetros numéricos
            # salen de las plantillas (cíclicamente) porque el heurístico no
            # interpreta el texto — el enlace JTBD sí se conserva.
            n = len(segments)
            archetypes = []
            for i, seg in enumerate(segments):
                tpl = _ARCHETYPE_TEMPLATES[i % len(_ARCHETYPE_TEMPLATES)]
                weights = {f: 0.5 for f in DEFAULT_FEATURES}
                for driver in tpl["drivers"]:
                    weights[driver] = 1.2
                archetypes.append(
                    {
                        "name": seg.get("segment") or tpl["name"],
                        "description": seg.get("main_pain") or seg.get("job_functional") or tpl["description"],
                        "segment_share": round(1.0 / n, 4),
                        "price_sensitivity": tpl["price_sensitivity"],
                        "adoption_prob_base": tpl["adoption_prob_base"],
                        "feature_weights": weights,
                        "key_drivers": tpl["drivers"],
                        **jtbd_link(seg),
                    }
                )
            return archetypes
        n = max(1, min(n_profiles, len(_ARCHETYPE_TEMPLATES)))
        templates = _ARCHETYPE_TEMPLATES[:n]
        archetypes: list[dict[str, Any]] = []
        for tpl in templates:
            weights = {f: 0.5 for f in DEFAULT_FEATURES}
            for driver in tpl["drivers"]:
                weights[driver] = 1.2
            archetypes.append(
                {
                    "name": tpl["name"],
                    "description": tpl["description"],
                    "segment_share": round(1.0 / n, 4),
                    "price_sensitivity": tpl["price_sensitivity"],
                    "adoption_prob_base": tpl["adoption_prob_base"],
                    "feature_weights": weights,
                    "key_drivers": tpl["drivers"],
                }
            )
        return archetypes

    def explain_objections(
        self,
        idea: str,
        objections: list[dict[str, Any]],
        metrics: dict[str, Any],
    ) -> dict[str, Any]:
        acc = metrics.get("acceptance_rate", {}).get("mean", 0.0)
        top = objections[0]["objection"] if objections else None
        summary = f"La aceptación media estimada es del {acc:.0%}. " + (
            f"La objeción dominante es '{top}'."
            if top
            else "No se detectaron objeciones relevantes."
        )
        recommendations = [
            {
                "objection": o["objection"],
                "frequency": o["frequency"],
                "recommendation": _OBJECTION_RECOMMENDATIONS.get(
                    o["objection"], "Analiza esta objeción con investigación cualitativa."
                ),
            }
            for o in objections
        ]
        return {
            "summary": summary,
            "recommendations": recommendations,
            "source": self.source,
        }


# ---------------------------------------------------------------------------
# Implementación con Claude
# ---------------------------------------------------------------------------


class ClaudeProfileGenerator:
    """Genera arquetipos y explicaciones usando la API de Claude."""

    source = "claude"

    def __init__(self, client: llm_client.ClaudeClient | None = None):
        self._client = client or llm_client.ClaudeClient()
        self._fallback = HeuristicProfileGenerator()

    def generate_profiles(
        self,
        idea: str,
        target_audience: str,
        n_profiles: int,
        segments: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        system = (
            "Eres un investigador de mercado experto en segmentación de audiencias. "
            "Respondes SIEMPRE con JSON válido, sin texto adicional."
        )
        features = ", ".join(DEFAULT_FEATURES)
        if segments:
            seg_txt = "\n".join(
                f"{i + 1}. {s.get('segment', '')}: situación «{s.get('trigger_situation', '')}»; "
                f"dolor «{s.get('main_pain', '')}»; deseo «{s.get('main_desire', '')}»; "
                f"job funcional «{s.get('job_functional', '')}»"
                for i, s in enumerate(segments)
            )
            task = (
                f"Estos son los segmentos de demanda ya identificados (Jobs-to-be-Done):\n{seg_txt}\n\n"
                f"Genera EXACTAMENTE {len(segments)} arquetipos, uno por segmento y EN ESE ORDEN, "
                "usando el nombre del segmento como name. Estima segment_share (cuota de mercado "
                "relativa entre ellos, suma ~1), price_sensitivity y adoption_prob_base coherentes "
                "con su situación y su dolor."
            )
        else:
            task = f"Genera {n_profiles} arquetipos de audiencia distintos."
        prompt = (
            f"Idea de producto: {idea}\n"
            f"Público objetivo: {target_audience}\n\n"
            f"{task} Devuelve un JSON "
            'con la forma {"archetypes": [...]}. Cada arquetipo debe tener exactamente '
            "estas claves:\n"
            "- name (str)\n- description (str, 1 frase)\n"
            "- segment_share (float, 0-1; el conjunto debe sumar ~1)\n"
            "- price_sensitivity (float, 0-3; mayor = más sensible al precio)\n"
            "- adoption_prob_base (float, 0-1)\n"
            f"- feature_weights (objeto con las claves: {features}; valores 0-2)\n"
            "- key_drivers (lista de 1-3 de esas características)\n"
        )
        try:
            data = self._client.complete_json(system, prompt, max_tokens=2000)
            archetypes = data["archetypes"] if isinstance(data, dict) else data
            if not archetypes:
                raise ValueError("Respuesta vacía de Claude.")
            if segments:
                # Enlace JTBD por posición (el prompt fija el orden); sobrantes se descartan.
                archetypes = [
                    {**a, **jtbd_link(seg)} for a, seg in zip(archetypes, segments, strict=False)
                ]
            return archetypes
        except Exception as exc:  # noqa: BLE001 - fallback robusto
            logger.warning(
                "Fallo al generar perfiles con Claude (%s). Uso heurística.", exc
            )
            return self._fallback.generate_profiles(idea, target_audience, n_profiles, segments)

    def explain_objections(
        self,
        idea: str,
        objections: list[dict[str, Any]],
        metrics: dict[str, Any],
    ) -> dict[str, Any]:
        system = (
            "Eres un consultor de producto. Respondes SIEMPRE con JSON válido, "
            "conciso y accionable, en español."
        )
        prompt = (
            f"Idea de producto: {idea}\n\n"
            f"Resultados de la simulación de audiencia:\n"
            f"- Aceptación media: {metrics.get('acceptance_rate', {}).get('mean')}\n"
            f"- Intención de compra media: "
            f"{metrics.get('purchase_intent_probability', {}).get('mean')}\n"
            f"- Objeciones (frecuencia): {objections}\n\n"
            'Devuelve un JSON {"summary": str, "recommendations": [{"objection": str, '
            '"frequency": float, "recommendation": str}]} con una recomendación por '
            "objeción y un resumen ejecutivo de 2-3 frases."
        )
        try:
            data = self._client.complete_json(system, prompt, max_tokens=1200)
            data["source"] = self.source
            return data
        except Exception as exc:  # noqa: BLE001 - fallback robusto
            logger.warning(
                "Fallo al explicar objeciones con Claude (%s). Uso heurística.", exc
            )
            return self._fallback.explain_objections(idea, objections, metrics)


# ---------------------------------------------------------------------------
# Fábrica
# ---------------------------------------------------------------------------


def get_profile_generator() -> ProfileGenerator:
    """Devuelve el generador disponible (Claude si hay clave; si no, heurístico)."""
    if llm_client.is_available():
        try:
            return ClaudeProfileGenerator()
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo inicializar Claude (%s). Uso heurística.", exc)
    return HeuristicProfileGenerator()
