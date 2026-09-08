"""Señales de demanda externas (Fase 2.2).

Primera pieza del validator que sale de "solo descripción": busca en la web
evidencia real sobre la idea — competidores y alternativas, precios que ya
se cobran, cómo habla la gente del problema — y la entrega en dos formas:

- ``signals``: estructura para la UI (competidores, precios, citas, resumen).
- ``evidence_text``: bloque compacto que la rúbrica recibe como "EVIDENCIA
  EXTERNA" para anclar sus puntuaciones y poder marcar dimensiones como
  respaldadas por datos en vez de hipótesis.

Búsqueda vía Bright Data (SERP de Google) y síntesis vía Claude. Regla de
oro del validator: si falta el token, el SDK o la red, degrada a
``NoopDemandSignals`` (source="none") y nada se rompe. Las búsquedas no
sustituyen hablar con clientes: la confianza "alta" sigue reservada a la
evidencia real aportada por el usuario (``insights_raw``).
"""

from __future__ import annotations

import os
import re
from typing import Any, Protocol, runtime_checkable

from app.llm import client as llm_client
from app.utils.logging import get_logger

logger = get_logger(__name__)

#: Nº máximo de resultados por consulta y de consultas por análisis.
RESULTS_PER_QUERY = 6
MAX_QUERIES = 3

_STOPWORDS = {
    "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "para", "por", "con",
    "y", "o", "que", "en", "del", "al", "a", "se", "su", "sus", "es", "the", "of",
    "for", "and", "to", "with", "app", "plataforma", "servicio", "producto",
}


def is_available() -> bool:
    """Hay token de Bright Data y el SDK está instalado."""
    if not (os.getenv("BRIGHTDATA_API_TOKEN") or os.getenv("BRIGHTDATA_API_KEY")):
        return False
    try:
        import brightdata  # noqa: F401
    except ImportError:
        logger.warning("Token de Bright Data presente pero el paquete 'brightdata-sdk' no está instalado.")
        return False
    return True


def keywords(text: str, n: int = 6) -> str:
    """Palabras clave de un texto libre (sin stopwords), para armar consultas."""
    words = re.findall(r"[\wáéíóúñü]+", (text or "").lower())
    picked: list[str] = []
    for w in words:
        if len(w) > 2 and w not in _STOPWORDS and w not in picked:
            picked.append(w)
        if len(picked) >= n:
            break
    return " ".join(picked)


def build_queries(idea: str, target_audience: str, alternatives: str | None = None) -> list[str]:
    """Tres consultas deterministas: alternativas/precio, competidores y voz del cliente."""
    core = keywords(idea, 6)
    aud = keywords(target_audience, 3)
    qs = [
        f"{core} precio alternativas",
        f"{core} competidores mejores opciones {aud}".strip(),
        f"{core} {aud} problema opiniones reddit".strip(),
    ]
    if alternatives:
        qs[0] = f"{keywords(alternatives, 4)} vs {core} precio"
    return [re.sub(r"\s+", " ", q).strip() for q in qs][:MAX_QUERIES]


def normalize_result(item: Any, query: str) -> dict[str, str] | None:
    """Homogeneiza un resultado SERP (dict con claves variables) a title/url/snippet."""
    if not isinstance(item, dict):
        return None
    title = str(item.get("title") or item.get("name") or "").strip()
    url = str(item.get("link") or item.get("url") or item.get("href") or "").strip()
    snippet = str(item.get("description") or item.get("snippet") or item.get("text") or "").strip()
    if not url and not title:
        return None
    return {"title": title[:160], "url": url, "snippet": snippet[:300], "query": query}


def evidence_text_from(results: list[dict[str, str]], signals: dict[str, Any] | None) -> str:
    """Bloque compacto para el prompt de la rúbrica (máx. ~1.5k caracteres)."""
    lines: list[str] = []
    if signals:
        comps = signals.get("competitors") or []
        if comps:
            lines.append("Competidores/alternativas encontrados: " + "; ".join(
                f"{c.get('name', '')}{' — ' + c['note'] if c.get('note') else ''}" for c in comps[:5]
            ))
        prices = signals.get("price_points") or []
        if prices:
            lines.append("Precios observados: " + "; ".join(str(p) for p in prices[:5]))
        quotes = signals.get("problem_language") or []
        if quotes:
            lines.append("Cómo habla la gente del problema: " + " | ".join(f"«{q}»" for q in quotes[:4]))
        if signals.get("demand_indicators"):
            lines.append("Indicadores de demanda: " + str(signals["demand_indicators"]))
    else:
        for r in results[:8]:
            lines.append(f"- {r['title']}: {r['snippet']}")
    return "\n".join(lines)[:1500]


@runtime_checkable
class DemandSignals(Protocol):
    source: str

    def collect(
        self,
        idea: str,
        target_audience: str,
        *,
        alternatives: str | None = None,
    ) -> dict[str, Any]: ...


class NoopDemandSignals:
    """Sin token/SDK: no hay señales. Deja explícito por qué."""

    source = "none"

    def collect(self, idea: str, target_audience: str, *, alternatives: str | None = None) -> dict[str, Any]:
        return {
            "source": self.source,
            "queries": build_queries(idea, target_audience, alternatives),
            "results": [],
            "signals": None,
            "evidence_text": "",
            "note": "Señales externas no disponibles (configura BRIGHTDATA_API_TOKEN en el validator).",
        }


_SYSTEM = (
    "Eres un analista de mercado. Recibes resultados de búsqueda web sobre una idea de "
    "producto y extraes SOLO lo que está en los resultados (títulos y fragmentos): no "
    "inventes competidores, precios ni citas. Respondes SIEMPRE con JSON válido, en español."
)


def _synthesis_prompt(idea: str, target_audience: str, results: list[dict[str, str]]) -> str:
    listing = "\n".join(
        f"[{i + 1}] ({r['query']}) {r['title']} — {r['url']}\n    {r['snippet']}"
        for i, r in enumerate(results)
    )
    return (
        f"IDEA: {idea}\nPÚBLICO: {target_audience}\n\nRESULTADOS DE BÚSQUEDA:\n{listing}\n\n"
        "Extrae:\n"
        '- "competitors": [{"name": str, "url": str, "note": "qué ofrece / en qué se diferencia, 1 frase"}] '
        "(solo los que aparecen en los resultados; máx 6)\n"
        '- "price_points": [str] precios o modelos de cobro que aparezcan textualmente (máx 6)\n'
        '- "problem_language": [str] frases cortas de cómo la gente describe el problema o la '
        "necesidad, tomadas de los fragmentos (máx 5)\n"
        '- "demand_indicators": str, 1-2 frases sobre si hay señales de demanda activa '
        "(mucha oferta, comparativas, quejas recurrentes) o de mercado frío, y por qué\n"
        '- "evidence_summary": str, 2 frases con lo más relevante para decidir si la idea tiene mercado\n'
        '- "gaps": [str] qué NO se pudo confirmar con estas búsquedas (máx 3)\n\n'
        'Devuelve EXACTAMENTE: {"competitors": [], "price_points": [], "problem_language": [], '
        '"demand_indicators": "", "evidence_summary": "", "gaps": []}'
    )


class BrightDataDemandSignals:
    """Búsqueda real (SERP de Google vía Bright Data) + síntesis con Claude."""

    source = "brightdata"

    def __init__(self, client: Any | None = None, llm: llm_client.ClaudeClient | None = None):
        self._client = client
        self._llm = llm

    def _search(self, query: str) -> list[dict[str, str]]:
        if self._client is None:
            from brightdata import SyncBrightDataClient

            token = os.getenv("BRIGHTDATA_API_TOKEN") or os.getenv("BRIGHTDATA_API_KEY")
            self._client = SyncBrightDataClient(token=token, validate_token=False)
        res = self._client.search.google(query, num_results=RESULTS_PER_QUERY)
        data = getattr(res, "data", None) or []
        out = []
        for item in data:
            n = normalize_result(item, query)
            if n:
                out.append(n)
        return out[:RESULTS_PER_QUERY]

    def _synthesize(self, idea: str, target_audience: str, results: list[dict[str, str]]) -> dict[str, Any] | None:
        if not results or not llm_client.is_available():
            return None
        try:
            llm = self._llm or llm_client.ClaudeClient()
            data = llm.complete_json(_SYSTEM, _synthesis_prompt(idea, target_audience, results), max_tokens=1500, temperature=0.2)
            if not isinstance(data, dict):
                return None
            return {
                "competitors": [c for c in (data.get("competitors") or []) if isinstance(c, dict)][:6],
                "price_points": [str(p) for p in (data.get("price_points") or [])][:6],
                "problem_language": [str(q) for q in (data.get("problem_language") or [])][:5],
                "demand_indicators": str(data.get("demand_indicators") or ""),
                "evidence_summary": str(data.get("evidence_summary") or ""),
                "gaps": [str(g) for g in (data.get("gaps") or [])][:3],
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("Fallo al sintetizar señales con Claude (%s).", exc)
            return None

    def collect(self, idea: str, target_audience: str, *, alternatives: str | None = None) -> dict[str, Any]:
        queries = build_queries(idea, target_audience, alternatives)
        results: list[dict[str, str]] = []
        errors = 0
        for q in queries:
            try:
                results.extend(self._search(q))
            except Exception as exc:  # noqa: BLE001 - una consulta fallida no tumba el resto
                errors += 1
                logger.warning("Búsqueda fallida (%s): %s", q, exc)
        # Dedupe por URL.
        seen: set[str] = set()
        unique = []
        for r in results:
            key = r["url"] or r["title"]
            if key not in seen:
                seen.add(key)
                unique.append(r)
        if not unique:
            out = NoopDemandSignals().collect(idea, target_audience, alternatives=alternatives)
            out["note"] = "Las búsquedas no devolvieron resultados." + (" Hubo errores de red." if errors else "")
            return out
        signals = self._synthesize(idea, target_audience, unique)
        return {
            "source": self.source,
            "queries": queries,
            "results": unique,
            "signals": signals,
            "evidence_text": evidence_text_from(unique, signals),
            "note": None if signals else "Resultados sin sintetizar (IA no disponible): se muestran en bruto.",
        }


def get_demand_signals() -> DemandSignals:
    if is_available():
        return BrightDataDemandSignals()
    return NoopDemandSignals()
