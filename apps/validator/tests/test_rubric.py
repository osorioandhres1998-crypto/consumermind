"""Pruebas de la rúbrica de evaluación (Fase 1.1) en su camino heurístico."""

import pytest

from app.llm.rubric import (
    DIMENSION_KEYS,
    HeuristicRubricEvaluator,
    RubricEvaluator,
    build_rubric,
    derive_confidence,
    get_rubric_evaluator,
    normalize_dimension,
    weighted_overall,
)


def test_heuristic_is_a_rubric_evaluator():
    ev = HeuristicRubricEvaluator()
    assert isinstance(ev, RubricEvaluator)
    assert ev.source == "heuristic"


def test_get_rubric_evaluator_falls_back_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert get_rubric_evaluator().source == "heuristic"


def test_heuristic_rubric_structure():
    r = HeuristicRubricEvaluator().evaluate("Una app de finanzas para freelancers", "freelancers")
    assert {d["key"] for d in r["dimensions"]} == set(DIMENSION_KEYS)
    for d in r["dimensions"]:
        assert 0.0 <= d["low"] <= d["score"] <= d["high"] <= 1.0
        assert d["is_hypothesis"] is True
    assert r["overall"]["low"] <= r["overall"]["score"] <= r["overall"]["high"]
    assert r["confidence"] == "baja"  # sin inputs extra ni insights
    assert len(r["missing_info"]) == 4
    assert r["key_assumptions"]


def test_normalize_dimension_clamps_and_orders():
    d = normalize_dimension({"score": 1.7, "low": 0.9, "high": 0.2, "rationale": " x "})
    assert d["score"] == 0.9  # recortado a [low, high] tras ordenar
    assert d["low"] == 0.2 and d["high"] == 0.9
    assert d["rationale"] == "x"
    # Valores no numéricos → defaults sensatos.
    d2 = normalize_dimension({"score": "n/a"})
    assert d2["score"] == 0.5 and d2["low"] == 0.25 and d2["high"] == 0.75


def test_weighted_overall_respects_weights():
    dims = {k: {"score": 0.0, "low": 0.0, "high": 0.0} for k in DIMENSION_KEYS}
    dims["problem_severity"] = {"score": 1.0, "low": 1.0, "high": 1.0}  # peso 0.20
    assert weighted_overall(dims)["score"] == pytest.approx(0.2, abs=1e-6)


def test_confidence_never_high_without_insights():
    narrow = {k: {"score": 0.5, "low": 0.45, "high": 0.55} for k in DIMENSION_KEYS}
    assert (
        derive_confidence(narrow, has_insights=False, has_price=True, has_alternatives=True)
        == "media"
    )
    assert (
        derive_confidence(narrow, has_insights=True, has_price=True, has_alternatives=True)
        == "alta"
    )


def test_build_rubric_forces_hypothesis_without_insights():
    raw = {k: {"score": 0.8, "low": 0.7, "high": 0.9, "is_hypothesis": False} for k in DIMENSION_KEYS}
    r = build_rubric(
        raw, key_assumptions=["a"], price="$10", alternatives="Excel", channel="Ads",
        insights_raw=None, source="test",
    )
    assert all(d["is_hypothesis"] for d in r["dimensions"])
    assert "Evidencia real" in r["missing_info"][0]
    assert len(r["missing_info"]) == 1
