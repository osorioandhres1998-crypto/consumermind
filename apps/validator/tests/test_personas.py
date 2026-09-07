"""Pruebas del panel de personas sintéticas (Fase 1.3), camino heurístico."""

import pytest

from app.llm.personas import (
    OBJECTION_CATEGORIES,
    HeuristicPersonaPanel,
    PersonaPanel,
    aggregate_panel,
    get_persona_panel,
    normalize_response,
)

ARCHETYPES = [
    {"name": "Early", "segment_share": 0.3, "adoption_prob_base": 0.5, "price_sensitivity": 0.6, "key_drivers": ["innovacion"]},
    {"name": "Tacaño", "segment_share": 0.5, "adoption_prob_base": 0.15, "price_sensitivity": 2.0, "key_drivers": ["confiabilidad"]},
    {"name": "Cauto", "segment_share": 0.2, "adoption_prob_base": 0.1, "price_sensitivity": 1.0, "key_drivers": ["soporte"]},
]


def test_heuristic_is_a_panel_and_default_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert isinstance(HeuristicPersonaPanel(), PersonaPanel)
    assert get_persona_panel().source == "heuristic"


def test_heuristic_panel_structure_and_weighting():
    p = HeuristicPersonaPanel().respond("Una app", "freelancers", ARCHETYPES)
    assert [r["persona"] for r in p["responses"]] == ["Early", "Tacaño", "Cauto"]
    assert all(1 <= r["intent"] <= 5 for r in p["responses"])
    # Intención ponderada por cuota: Early(3)*.3 + Tacaño(2)*.5 + Cauto(1)*.2 = 2.1
    assert p["intent_mean"] == pytest.approx(2.1, abs=0.01)
    assert p["top2box"] == 0.0
    assert p["objections"][0]["category"] == "precio"  # el segmento más grande
    assert sum(o["share"] for o in p["objections"]) == pytest.approx(1.0, abs=1e-3)
    assert all(o["category"] in OBJECTION_CATEGORIES for o in p["objections"])


def test_normalize_response_clamps_and_maps_category():
    r = normalize_response(
        {"intent": 9, "objection_category": "INVENTADA", "main_objection": " x "},
        {"name": "P", "segment_share": 0.4},
    )
    assert r["intent"] == 5 and r["objection_category"] == "otro" and r["main_objection"] == "x"
    assert normalize_response({"intent": "n/a"}, {"name": "P"})["intent"] == 3


def test_aggregate_only_counts_objections_of_non_buyers():
    responses = [
        normalize_response({"intent": 5, "objection_category": "precio"}, {"name": "A", "segment_share": 0.5}),
        normalize_response({"intent": 2, "objection_category": "confianza", "main_objection": "q"}, {"name": "B", "segment_share": 0.5}),
    ]
    agg = aggregate_panel(responses, "test")
    assert agg["top2box"] == 0.5
    assert [o["category"] for o in agg["objections"]] == ["confianza"]
    assert agg["objections"][0]["quotes"] == ["q"]


def test_aggregate_empty():
    agg = aggregate_panel([], "test")
    assert agg["responses"] == [] and agg["intent_mean"] is None
