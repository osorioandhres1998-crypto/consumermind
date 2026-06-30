"""Pruebas de la capa LLM en su camino heurístico (sin red ni clave de API)."""

import pytest

from app.llm.client import extract_json
from app.llm.config_builder import aggregate_archetypes, build_simulation_plan
from app.llm.profiles import (
    HeuristicProfileGenerator,
    ProfileGenerator,
    get_profile_generator,
)


def test_extract_json_plain():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_with_code_fence():
    text = '```json\n{\n  "a": 1,\n  "b": [1, 2]\n}\n```'
    assert extract_json(text) == {"a": 1, "b": [1, 2]}


def test_extract_json_with_surrounding_text():
    text = 'Aquí tienes: {"x": true} ¡listo!'
    assert extract_json(text) == {"x": True}


def test_heuristic_generator_is_a_profile_generator():
    gen = HeuristicProfileGenerator()
    assert isinstance(gen, ProfileGenerator)
    assert gen.source == "heuristic"


def test_heuristic_profiles_structure():
    gen = HeuristicProfileGenerator()
    profiles = gen.generate_profiles("Una app de finanzas", "freelancers", 5)
    assert len(profiles) == 5
    for p in profiles:
        assert {
            "name",
            "segment_share",
            "price_sensitivity",
            "feature_weights",
        } <= p.keys()
    # Las cuotas suman ~1.
    assert sum(p["segment_share"] for p in profiles) == pytest.approx(1.0, abs=0.01)


def test_get_profile_generator_falls_back_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    gen = get_profile_generator()
    assert gen.source == "heuristic"


def test_aggregate_archetypes_weighted_mean():
    archetypes = [
        {
            "segment_share": 0.5,
            "price_sensitivity": 2.0,
            "adoption_prob_base": 0.4,
            "feature_weights": {"a": 1.0, "b": 0.0},
        },
        {
            "segment_share": 0.5,
            "price_sensitivity": 0.0,
            "adoption_prob_base": 0.2,
            "feature_weights": {"a": 0.0, "b": 1.0},
        },
    ]
    agg = aggregate_archetypes(archetypes)
    assert agg["price_sensitivity"] == pytest.approx(1.0)
    assert agg["adoption_prob_base"] == pytest.approx(0.3)
    assert agg["feature_weights"]["a"] == pytest.approx(0.5)
    assert agg["feature_weights"]["b"] == pytest.approx(0.5)


def test_aggregate_handles_zero_shares():
    archetypes = [
        {"segment_share": 0.0, "feature_weights": {"a": 1.0}},
        {"segment_share": 0.0, "feature_weights": {"a": 0.5}},
    ]
    agg = aggregate_archetypes(archetypes)
    # Reparto uniforme => media simple.
    assert agg["feature_weights"]["a"] == pytest.approx(0.75)


def test_build_simulation_plan_heuristic(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    plan = build_simulation_plan(
        idea="Plataforma de validación de MVP con audiencias simuladas",
        target_audience="startups B2B en LATAM",
        n_archetypes=6,
        simulation_overrides={"n_iterations": 500, "population_size": 300},
    )
    assert plan["source"] == "heuristic"
    assert len(plan["archetypes"]) == 6
    cfg = plan["config"]
    assert cfg["n_iterations"] == 500
    assert cfg["population_size"] == 300
    assert 0.0 < cfg["adoption_prob_base"] < 1.0
    assert cfg["feature_weights"]


def test_heuristic_explain_objections():
    gen = HeuristicProfileGenerator()
    metrics = {
        "acceptance_rate": {"mean": 0.31},
        "purchase_intent_probability": {"mean": 0.2},
    }
    objections = [
        {"objection": "precio_alto", "frequency": 0.5, "count": 50},
        {"objection": "no_lo_necesita", "frequency": 0.3, "count": 30},
    ]
    insights = gen.explain_objections("Una idea", objections, metrics)
    assert "summary" in insights
    assert len(insights["recommendations"]) == 2
    assert insights["source"] == "heuristic"
