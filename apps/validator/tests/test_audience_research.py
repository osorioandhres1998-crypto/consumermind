"""Pruebas del módulo Audience Research (camino heurístico, sin red)."""

from fastapi.testclient import TestClient

from app.llm.audience_research import (
    SEGMENT_KEYS,
    AudienceResearcher,
    HeuristicAudienceResearcher,
    get_audience_researcher,
)
from app.main import app

client = TestClient(app)


def test_heuristic_is_audience_researcher():
    researcher = HeuristicAudienceResearcher()
    assert isinstance(researcher, AudienceResearcher)
    assert researcher.source == "heuristic"


def test_research_structure_without_insights():
    researcher = HeuristicAudienceResearcher()
    result = researcher.research("Una app de finanzas para freelancers")
    assert {"summary", "segments", "source"} <= result.keys()
    assert 2 <= len(result["segments"]) <= 4
    for seg in result["segments"]:
        assert set(SEGMENT_KEYS) <= seg.keys()
        # Sin insights => todo es hipótesis.
        assert seg["is_hypothesis"] is True
        assert seg["evidence"] == "hipótesis"


def test_research_uses_insights_when_provided():
    researcher = HeuristicAudienceResearcher()
    insight = "Un cliente dijo: paso 5 horas al mes cuadrando gastos"
    result = researcher.research(
        "App de finanzas", audience_hint="freelancers", insights_raw=insight
    )
    assert all(seg["is_hypothesis"] is False for seg in result["segments"])
    assert all(insight[:30] in seg["evidence"] for seg in result["segments"])
    # La pista de audiencia se refleja en el nombre del segmento.
    assert any("freelancers" in seg["segment"] for seg in result["segments"])


def test_factory_falls_back_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert get_audience_researcher().source == "heuristic"


def test_endpoint_returns_segments(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    payload = {
        "product": "Plataforma que valida ideas con audiencias simuladas por IA.",
        "audience_hint": "Startups B2B en LATAM",
    }
    resp = client.post("/audience-research", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "heuristic"
    assert 2 <= len(body["segments"]) <= 4
    assert "segment" in body["segments"][0]


def test_endpoint_validates_short_product():
    resp = client.post("/audience-research", json={"product": "corto"})
    assert resp.status_code == 422
