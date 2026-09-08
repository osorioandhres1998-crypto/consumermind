"""Pruebas de la rúbrica de evaluación (Fase 1.1) en su camino heurístico."""

import pytest

from app.llm.rubric import (
    DIMENSION_KEYS,
    HeuristicRubricEvaluator,
    RubricEvaluator,
    build_rubric,
    derive_confidence,
    get_rubric_evaluator,
    merge_rubric_runs,
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


def test_merge_rubric_runs_takes_medians_and_any_hypothesis():
    def run(score, hyp, note):
        return {
            "dimensions": {k: {"score": score, "low": score - 0.1, "high": score + 0.1,
                               "rationale": note, "is_hypothesis": hyp} for k in DIMENSION_KEYS},
            "key_assumptions": [f"a-{note}", "común"],
        }
    merged = merge_rubric_runs([run(0.3, False, "baja"), run(0.5, False, "media"), run(0.9, True, "alta")])
    d = merged["dimensions"]["problem_severity"]
    assert d["score"] == pytest.approx(0.5)
    assert d["low"] == pytest.approx(0.4) and d["high"] == pytest.approx(0.6)
    assert d["rationale"] == "media"  # la corrida más cercana a la mediana
    assert d["is_hypothesis"] is True  # basta con que una lo marque
    assert merged["key_assumptions"] == ["a-baja", "común", "a-media", "a-alta"]
    single = run(0.7, False, "x")
    assert merge_rubric_runs([single]) is single


def test_claude_evaluator_ensemble_uses_median(monkeypatch):
    from app.llm import rubric as mod

    class FakeClient:
        def __init__(self):
            self.calls = 0

        def complete_json(self, system, prompt, **kw):
            self.calls += 1
            score = [0.2, 0.6, 0.9][(self.calls - 1) % 3]
            return {
                "dimensions": {k: {"score": score, "low": 0.1, "high": 0.95} for k in DIMENSION_KEYS},
                "key_assumptions": ["x"],
            }

    monkeypatch.setattr(mod, "ENSEMBLE_N", 3)
    fake = FakeClient()
    r = mod.ClaudeRubricEvaluator(client=fake).evaluate("Una idea de producto", "audiencia")
    assert fake.calls == 3 and r["ensemble_runs"] == 3 and r["source"] == "claude"
    assert r["dimensions"][0]["score"] == pytest.approx(0.6)


def test_claude_evaluator_falls_back_when_all_runs_fail(monkeypatch):
    from app.llm import rubric as mod

    class Broken:
        def complete_json(self, *a, **k):
            raise RuntimeError("boom")

    monkeypatch.setattr(mod, "ENSEMBLE_N", 2)
    r = mod.ClaudeRubricEvaluator(client=Broken()).evaluate("Una idea de producto", "audiencia")
    assert r["source"] == "heuristic" and r["ensemble_runs"] == 0
