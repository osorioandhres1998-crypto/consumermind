"""Rúbrica de evaluación de la idea con incertidumbre explícita (Fase 1.1).

Sustituye la "intuición en tres números" del generador de arquetipos por una
evaluación estructurada y auditable. Para cada dimensión el evaluador entrega
una puntuación central (``score``), un rango (``low``/``high``) que representa
lo que NO sabe, una justificación y si es hipótesis o está respaldada por los
insights aportados. La incertidumbre declarada aquí es la que el Monte Carlo v2
(Fase 1.2) propagará, en lugar de ruido uniforme sin significado.

Mismo patrón que ``profiles.py``: interfaz + implementación con Claude +
fallback heurístico determinista (regla de oro: funciona sin red ni clave).
"""

from __future__ import annotations

import os
import statistics
from typing import Any, Protocol, runtime_checkable

from app.llm import client as llm_client
from app.utils.logging import get_logger

logger = get_logger(__name__)

#: Dimensiones de la rúbrica, con su peso en la puntuación global y la
#: pregunta que responde cada una (se usa en el prompt y en la UI).
DIMENSIONS: tuple[dict[str, Any], ...] = (
    {
        "key": "problem_severity",
        "label": "Severidad del problema",
        "weight": 0.20,
        "question": "¿Cuánto duele hoy el problema que resuelve? (0 = molestia menor, 1 = crítico)",
    },
    {
        "key": "problem_frequency",
        "label": "Frecuencia del problema",
        "weight": 0.15,
        "question": "¿Con qué frecuencia lo vive la audiencia? (0 = rara vez, 1 = a diario)",
    },
    {
        "key": "alternatives_weakness",
        "label": "Debilidad de las alternativas",
        "weight": 0.15,
        "question": "¿Qué tan mal resuelven el problema las alternativas actuales, incluida 'no hacer nada'? (0 = ya está bien resuelto, 1 = no hay nada bueno)",
    },
    {
        "key": "willingness_to_pay",
        "label": "Disposición a pagar",
        "weight": 0.20,
        "question": "¿La audiencia paga hoy por resolver esto y el precio propuesto es coherente con ese gasto? (0 = no paga, 1 = paga y el precio encaja)",
    },
    {
        "key": "channel_access",
        "label": "Acceso al canal",
        "weight": 0.10,
        "question": "¿Es realista llegar a esta audiencia por el canal propuesto a un coste razonable? (0 = inalcanzable, 1 = canal probado)",
    },
    {
        "key": "differentiation",
        "label": "Diferenciación",
        "weight": 0.10,
        "question": "¿La propuesta es claramente distinta y esa diferencia importa al cliente? (0 = commodity, 1 = única y relevante)",
    },
    {
        "key": "timing",
        "label": "Timing de mercado",
        "weight": 0.10,
        "question": "¿Hay un cambio reciente (tecnológico, regulatorio, cultural) que haga que ahora sea el momento? (0 = mercado maduro/frío, 1 = ventana abierta)",
    },
)

DIMENSION_KEYS = tuple(d["key"] for d in DIMENSIONS)
_WEIGHTS = {d["key"]: float(d["weight"]) for d in DIMENSIONS}

CONFIDENCE_LEVELS = ("baja", "media", "alta")

#: Fase 1.4 — nº de corridas del LLM que se combinan por mediana. Una sola
#: corrida a temperatura > 0 hace que la misma idea puntúe distinto cada vez;
#: la mediana de 3 estabiliza sin disparar el coste.
ENSEMBLE_N = max(1, int(os.getenv("RUBRIC_ENSEMBLE_N", "3")))


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def _clamp01(x: Any, default: float = 0.5) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return default
    if v != v:  # NaN
        return default
    return min(1.0, max(0.0, v))


def normalize_dimension(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Sanea una dimensión: recorta a [0, 1] y garantiza low <= score <= high."""
    raw = raw or {}
    score = _clamp01(raw.get("score"), 0.5)
    low = _clamp01(raw.get("low"), max(0.0, score - 0.25))
    high = _clamp01(raw.get("high"), min(1.0, score + 0.25))
    low, high = min(low, high), max(low, high)
    score = min(max(score, low), high)
    return {
        "score": round(score, 3),
        "low": round(low, 3),
        "high": round(high, 3),
        "rationale": str(raw.get("rationale") or "").strip(),
        "is_hypothesis": bool(raw.get("is_hypothesis", True)),
    }


def weighted_overall(dimensions: dict[str, dict[str, Any]]) -> dict[str, float]:
    """Puntuación global ponderada y su rango (propagando low/high)."""
    total_w = sum(_WEIGHTS.values())
    score = sum(_WEIGHTS[k] * dimensions[k]["score"] for k in DIMENSION_KEYS) / total_w
    low = sum(_WEIGHTS[k] * dimensions[k]["low"] for k in DIMENSION_KEYS) / total_w
    high = sum(_WEIGHTS[k] * dimensions[k]["high"] for k in DIMENSION_KEYS) / total_w
    return {"score": round(score, 3), "low": round(low, 3), "high": round(high, 3)}


def derive_confidence(
    dimensions: dict[str, dict[str, Any]],
    *,
    has_insights: bool,
    has_price: bool,
    has_alternatives: bool,
    has_external: bool = False,
) -> str:
    """Confianza del modelo en su propia evaluación.

    Sube con la riqueza de los inputs (insights reales, precio, alternativas) y
    con rangos estrechos; sin insights reales NUNCA es "alta": la descripción
    de una idea no sustituye el contacto con clientes.
    """
    points = 0
    if has_insights:
        points += 1
    if has_external:
        points += 1  # Fase 2.2: señales web reales (competidores, precios, voz del cliente)
    if has_price and has_alternatives:
        points += 1
    spread = sum(d["high"] - d["low"] for d in dimensions.values()) / len(dimensions)
    if spread <= 0.3:
        points += 1
    level = CONFIDENCE_LEVELS[min(points, 2)]
    if level == "alta" and not has_insights:
        level = "media"
    return level


def _missing_info(
    *, price: str | None, alternatives: str | None, channel: str | None, insights_raw: str | None
) -> list[str]:
    missing = []
    if not (price and price.strip()):
        missing.append("Precio propuesto (sin él, la disposición a pagar es pura hipótesis).")
    if not (alternatives and alternatives.strip()):
        missing.append("Cómo resuelve hoy el problema la audiencia (alternativas y 'no hacer nada').")
    if not (channel and channel.strip()):
        missing.append("Canal principal por el que piensas llegar a la audiencia.")
    if not (insights_raw and insights_raw.strip()):
        missing.append(
            "Evidencia real: entrevistas, conversaciones de venta, tickets o hilos de redes."
        )
    return missing


def merge_rubric_runs(runs: list[dict[str, Any]]) -> dict[str, Any]:
    """Combina varias corridas crudas del LLM en una sola (Fase 1.4).

    Por dimensión: mediana de ``score``/``low``/``high``; la justificación se
    toma de la corrida cuyo score quedó más cerca de la mediana (no se mezclan
    textos); ``is_hypothesis`` es True si CUALQUIER corrida lo marcó así.
    ``key_assumptions``: unión en orden, sin duplicados, hasta 6.
    """
    if not runs:
        raise ValueError("Sin corridas que combinar.")
    if len(runs) == 1:
        return runs[0]
    merged_dims: dict[str, Any] = {}
    for k in DIMENSION_KEYS:
        per_run = [normalize_dimension((r.get("dimensions") or {}).get(k)) for r in runs]
        med_score = statistics.median(d["score"] for d in per_run)
        closest = min(per_run, key=lambda d: abs(d["score"] - med_score))
        merged_dims[k] = {
            "score": med_score,
            "low": statistics.median(d["low"] for d in per_run),
            "high": statistics.median(d["high"] for d in per_run),
            "rationale": closest["rationale"],
            "is_hypothesis": any(d["is_hypothesis"] for d in per_run),
        }
    assumptions: list[str] = []
    for r in runs:
        for a in r.get("key_assumptions") or []:
            a = str(a).strip()
            if a and a not in assumptions:
                assumptions.append(a)
    return {"dimensions": merged_dims, "key_assumptions": assumptions[:6]}


def build_rubric(
    dimensions_raw: dict[str, Any],
    *,
    key_assumptions: list[str],
    price: str | None,
    alternatives: str | None,
    channel: str | None,
    insights_raw: str | None,
    source: str,
    external_evidence: str | None = None,
) -> dict[str, Any]:
    """Ensambla la rúbrica final a partir de dimensiones crudas (LLM o heurística)."""
    dims = {k: normalize_dimension(dimensions_raw.get(k)) for k in DIMENSION_KEYS}
    has_insights = bool(insights_raw and insights_raw.strip())
    has_external = bool(external_evidence and external_evidence.strip())
    if not has_insights and not has_external:
        # Sin evidencia (del usuario o web) todo es hipótesis, diga lo que diga el modelo.
        for d in dims.values():
            d["is_hypothesis"] = True
    overall = weighted_overall(dims)
    confidence = derive_confidence(
        dims,
        has_insights=has_insights,
        has_price=bool(price and price.strip()),
        has_alternatives=bool(alternatives and alternatives.strip()),
        has_external=has_external,
    )
    evidence_sources = [s for s, ok in (("usuario", has_insights), ("web", has_external)) if ok]
    return {
        "dimensions": [
            {"key": d["key"], "label": d["label"], "weight": d["weight"], **dims[d["key"]]}
            for d in DIMENSIONS
        ],
        "overall": overall,
        "confidence": confidence,
        "key_assumptions": [str(a).strip() for a in key_assumptions if str(a).strip()][:6],
        "missing_info": _missing_info(
            price=price, alternatives=alternatives, channel=channel, insights_raw=insights_raw
        ),
        "source": source,
        "ensemble_runs": 0,
        "evidence_sources": evidence_sources,
    }


# ---------------------------------------------------------------------------
# Interfaz
# ---------------------------------------------------------------------------


@runtime_checkable
class RubricEvaluator(Protocol):
    source: str

    def evaluate(
        self,
        idea: str,
        target_audience: str,
        *,
        price: str | None = None,
        alternatives: str | None = None,
        channel: str | None = None,
        insights_raw: str | None = None,
        external_evidence: str | None = None,
    ) -> dict[str, Any]: ...


# ---------------------------------------------------------------------------
# Heurístico (offline, determinista)
# ---------------------------------------------------------------------------


class HeuristicRubricEvaluator:
    """Fallback sin red: puntuaciones neutras con rangos anchos.

    No pretende evaluar la idea; deja explícito que sin modelo ni datos la
    incertidumbre es máxima. Los rangos se estrechan ligeramente cuando el
    usuario aporta precio/alternativas/canal, porque esos inputs sí reducen
    lo desconocido aunque no se puedan interpretar aquí.
    """

    source = "heuristic"

    def evaluate(
        self,
        idea: str,
        target_audience: str,
        *,
        price: str | None = None,
        alternatives: str | None = None,
        channel: str | None = None,
        insights_raw: str | None = None,
        external_evidence: str | None = None,
    ) -> dict[str, Any]:
        half = 0.35
        dims_raw: dict[str, Any] = {}
        for d in DIMENSIONS:
            k = d["key"]
            spread = half
            if k == "willingness_to_pay" and price:
                spread = 0.25
            if k == "alternatives_weakness" and alternatives:
                spread = 0.25
            if k == "channel_access" and channel:
                spread = 0.25
            dims_raw[k] = {
                "score": 0.5,
                "low": 0.5 - spread,
                "high": 0.5 + spread,
                "rationale": "Sin evaluación por IA disponible: puntuación neutra con rango amplio.",
                "is_hypothesis": True,
            }
        return build_rubric(
            dims_raw,
            key_assumptions=[
                "La audiencia descrita reconoce el problema como propio.",
                "Existe disposición a pagar por una solución dedicada.",
                "El canal propuesto permite llegar a la audiencia a un coste viable.",
            ],
            price=price,
            alternatives=alternatives,
            channel=channel,
            insights_raw=insights_raw,
            source=self.source,
            external_evidence=external_evidence,
        )


# ---------------------------------------------------------------------------
# Claude
# ---------------------------------------------------------------------------

_SYSTEM = (
    "Eres un analista de producto riguroso y escéptico. Evalúas ideas de negocio con "
    "una rúbrica y declaras explícitamente tu incertidumbre. No adulas la idea: si "
    "falta información, lo dices y ensanchas el rango. Respondes SIEMPRE con JSON "
    "válido, sin texto adicional, en español."
)


def _build_prompt(
    idea: str,
    target_audience: str,
    price: str | None,
    alternatives: str | None,
    channel: str | None,
    insights_raw: str | None,
    external_evidence: str | None = None,
) -> str:
    lines = [f"IDEA DE PRODUCTO: {idea}", f"PÚBLICO OBJETIVO: {target_audience}"]
    if price:
        lines.append(f"PRECIO PROPUESTO: {price}")
    if alternatives:
        lines.append(f"ALTERNATIVAS ACTUALES: {alternatives}")
    if channel:
        lines.append(f"CANAL PRINCIPAL: {channel}")
    if insights_raw:
        lines.append(f"INSIGHTS REALES (entrevistas, ventas, soporte, redes):\n{insights_raw}")
    if external_evidence:
        lines.append(
            "EVIDENCIA EXTERNA (búsqueda web: competidores, precios, cómo se habla del "
            f"problema; NO son citas de clientes de esta idea):\n{external_evidence}"
        )

    dims_desc = "\n".join(f'- "{d["key"]}": {d["question"]}' for d in DIMENSIONS)
    return (
        "\n".join(lines)
        + "\n\nEvalúa la idea en estas dimensiones (todas en escala 0-1):\n"
        + dims_desc
        + "\n\nPara CADA dimensión devuelve:\n"
        '- "score": tu estimación central.\n'
        '- "low" y "high": el rango en el que crees que está el valor real. Si no tienes '
        "información, el rango debe ser ANCHO (≥ 0.4). Si hay insights reales que lo "
        "respalden, puede ser estrecho.\n"
        '- "rationale": 1-2 frases concretas a ESTA idea y ESTA audiencia, no genéricas.\n'
        '- "is_hypothesis": false SOLO si la puntuación se apoya en los insights reales '
        "aportados o en la evidencia externa; true en cualquier otro caso. Cuando uses la "
        "evidencia externa, cítala en rationale (p. ej. 'hay 4 competidores cobrando $9-29/mes').\n\n"
        'Además devuelve "key_assumptions": las 3-5 suposiciones que TIENEN que ser '
        "ciertas para que la idea funcione (formuladas como afirmaciones comprobables).\n\n"
        "Reglas:\n"
        "- No inventes datos ni citas. Sin evidencia, todo es hipótesis.\n"
        "- Si el precio no se indica, willingness_to_pay debe tener rango ancho.\n"
        "- Si no se indican alternativas, evalúa alternatives_weakness con lo que sepas del "
        "mercado, pero con rango ancho.\n\n"
        "Devuelve EXACTAMENTE este JSON:\n"
        "{\n"
        '  "dimensions": {\n'
        + ",\n".join(
            f'    "{d["key"]}": {{"score": 0.5, "low": 0.3, "high": 0.7, "rationale": "...", "is_hypothesis": true}}'
            for d in DIMENSIONS
        )
        + "\n  },\n"
        '  "key_assumptions": ["...", "..."]\n'
        "}"
    )


class ClaudeRubricEvaluator:
    """Evaluación de la rúbrica con la API de Claude (temperatura baja)."""

    source = "claude"

    def __init__(self, client: llm_client.ClaudeClient | None = None):
        self._client = client or llm_client.ClaudeClient()
        self._fallback = HeuristicRubricEvaluator()

    def evaluate(
        self,
        idea: str,
        target_audience: str,
        *,
        price: str | None = None,
        alternatives: str | None = None,
        channel: str | None = None,
        insights_raw: str | None = None,
        external_evidence: str | None = None,
    ) -> dict[str, Any]:
        prompt = _build_prompt(
            idea, target_audience, price, alternatives, channel, insights_raw, external_evidence
        )
        runs: list[dict[str, Any]] = []
        for i in range(ENSEMBLE_N):
            try:
                data = self._client.complete_json(
                    _SYSTEM, prompt, max_tokens=2500, temperature=0.2
                )
                dims_raw = data.get("dimensions") if isinstance(data, dict) else None
                if not isinstance(dims_raw, dict) or not dims_raw:
                    raise ValueError("Respuesta sin dimensiones.")
                runs.append(
                    {"dimensions": dims_raw, "key_assumptions": list(data.get("key_assumptions") or [])}
                )
            except Exception as exc:  # noqa: BLE001 - una corrida fallida no tumba el ensemble
                logger.warning("Corrida %d/%d de la rúbrica falló (%s).", i + 1, ENSEMBLE_N, exc)
        if runs:
            merged = merge_rubric_runs(runs)
            rubric = build_rubric(
                merged["dimensions"],
                key_assumptions=merged["key_assumptions"],
                price=price,
                alternatives=alternatives,
                channel=channel,
                insights_raw=insights_raw,
                source=self.source,
                external_evidence=external_evidence,
            )
            rubric["ensemble_runs"] = len(runs)
            return rubric
        logger.warning("Todas las corridas de la rúbrica fallaron. Uso heurística.")
        if True:
            return self._fallback.evaluate(
                idea,
                target_audience,
                price=price,
                alternatives=alternatives,
                channel=channel,
                insights_raw=insights_raw,
                external_evidence=external_evidence,
            )


def get_rubric_evaluator() -> RubricEvaluator:
    """Devuelve el evaluador disponible (Claude si hay clave; si no, heurístico)."""
    if llm_client.is_available():
        try:
            return ClaudeRubricEvaluator()
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo inicializar Claude (%s). Uso heurística.", exc)
    return HeuristicRubricEvaluator()
