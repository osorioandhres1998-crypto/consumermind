"""Pruebas de las señales de demanda externas (Fase 2.2), sin red."""

from types import SimpleNamespace

from app.llm.demand_signals import (
    BrightDataDemandSignals,
    DemandSignals,
    NoopDemandSignals,
    build_queries,
    evidence_text_from,
    get_demand_signals,
    keywords,
    normalize_result,
)
from app.llm.rubric import DIMENSION_KEYS, build_rubric


def test_noop_without_token(monkeypatch):
    monkeypatch.delenv("BRIGHTDATA_API_TOKEN", raising=False)
    monkeypatch.delenv("BRIGHTDATA_API_KEY", raising=False)
    s = get_demand_signals()
    assert isinstance(s, DemandSignals) and s.source == "none"
    out = s.collect("Una app de recetas para bebés", "padres primerizos")
    assert out["results"] == [] and out["evidence_text"] == "" and out["queries"]


def test_keywords_and_queries_are_deterministic():
    assert keywords("Una app de recetas saludables para bebés de 6 meses") == "recetas saludables bebés meses"
    qs = build_queries("Una app de recetas saludables para bebés", "padres primerizos", alternatives="libros de recetas")
    assert len(qs) == 3 and qs[0].startswith("libros recetas vs")
    assert build_queries("x", "y") == build_queries("x", "y")


def test_normalize_result_handles_variants():
    assert normalize_result({"title": "A", "link": "http://a", "description": "d"}, "q") == {
        "title": "A", "url": "http://a", "snippet": "d", "query": "q"}
    assert normalize_result({"name": "B", "url": "http://b", "snippet": "s"}, "q")["url"] == "http://b"
    assert normalize_result({"foo": 1}, "q") is None
    assert normalize_result("texto", "q") is None


def test_collect_searches_dedupes_and_degrades_without_llm(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    calls = []

    class FakeSearch:
        def google(self, query, **kw):
            calls.append(query)
            return SimpleNamespace(data=[
                {"title": "Comp A", "link": "http://a", "description": "Plan desde $9/mes"},
                {"title": "Comp A dup", "link": "http://a", "description": "dup"},
            ])

    fake = SimpleNamespace(search=FakeSearch())
    out = BrightDataDemandSignals(client=fake).collect("Una app de finanzas para freelancers", "freelancers")
    assert out["source"] == "brightdata" and len(calls) == 3
    assert [r["url"] for r in out["results"]] == ["http://a"]  # dedupe por URL
    assert out["signals"] is None and "Comp A" in out["evidence_text"]


def test_collect_with_synthesis_and_failed_query():
    class FakeSearch:
        def __init__(self):
            self.n = 0
        def google(self, query, **kw):
            self.n += 1
            if self.n == 2:
                raise RuntimeError("timeout")
            return SimpleNamespace(data=[{"title": f"R{self.n}", "link": f"http://r{self.n}", "description": "caro para lo que da"}])

    class FakeLLM:
        def complete_json(self, system, prompt, **kw):
            assert "R1" in prompt
            return {"competitors": [{"name": "R1", "url": "http://r1", "note": "líder"}],
                    "price_points": ["$9/mes"], "problem_language": ["caro para lo que da"],
                    "demand_indicators": "hay oferta", "evidence_summary": "mercado activo", "gaps": ["precio real"]}

    import app.llm.demand_signals as mod
    orig = mod.llm_client.is_available
    mod.llm_client.is_available = lambda: True
    try:
        out = BrightDataDemandSignals(client=SimpleNamespace(search=FakeSearch()), llm=FakeLLM()).collect("idea", "aud")
    finally:
        mod.llm_client.is_available = orig
    assert len(out["results"]) == 2 and out["signals"]["competitors"][0]["name"] == "R1"
    assert "Competidores" in out["evidence_text"] and "$9/mes" in out["evidence_text"]


def test_collect_all_queries_fail_returns_noop_shape():
    class Broken:
        def google(self, *a, **k):
            raise RuntimeError("down")
    out = BrightDataDemandSignals(client=SimpleNamespace(search=Broken())).collect("idea", "aud")
    assert out["source"] == "none" and "errores" in out["note"]


def test_rubric_external_evidence_raises_confidence_but_not_to_high():
    raw = {k: {"score": 0.6, "low": 0.5, "high": 0.7, "is_hypothesis": False} for k in DIMENSION_KEYS}
    base = build_rubric(raw, key_assumptions=[], price="$10", alternatives="Excel", channel="Ads",
                        insights_raw=None, source="t")
    ext = build_rubric(raw, key_assumptions=[], price="$10", alternatives="Excel", channel="Ads",
                       insights_raw=None, external_evidence="Competidores: A, B", source="t")
    assert base["confidence"] == "media" and all(d["is_hypothesis"] for d in base["dimensions"])
    assert ext["confidence"] == "media"  # nunca "alta" sin evidencia real del usuario
    assert not any(d["is_hypothesis"] for d in ext["dimensions"])  # la evidencia web sí puede respaldar
    assert ext["evidence_sources"] == ["web"]
    assert evidence_text_from([], None) == ""
