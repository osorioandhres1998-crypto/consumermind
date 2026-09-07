"""Pruebas del Monte Carlo v2 (propagación de incertidumbre, Fase 1.2)."""

import numpy as np
import pytest

from app.llm.rubric import DIMENSION_KEYS, HeuristicRubricEvaluator, build_rubric
from app.sim.monte_carlo_v2 import parse_price, run_simulation_v2, sample_pert


def _rubric(score: float, half: float) -> dict:
    raw = {
        k: {"score": score, "low": max(0.0, score - half), "high": min(1.0, score + half)}
        for k in DIMENSION_KEYS
    }
    return build_rubric(
        raw, key_assumptions=[], price=None, alternatives=None, channel=None,
        insights_raw=None, source="test",
    )


ARCHETYPES = [
    {"name": "Early", "segment_share": 0.3, "adoption_prob_base": 0.4, "price_sensitivity": 0.6},
    {"name": "Pragmático", "segment_share": 0.7, "adoption_prob_base": 0.15, "price_sensitivity": 1.8},
]


def test_pert_samples_stay_in_bounds_and_center_on_mode():
    rng = np.random.default_rng(1)
    s = sample_pert(rng, 0.2, 0.6, 0.8, 20000)
    assert s.min() >= 0.2 and s.max() <= 0.8
    assert abs(np.median(s) - 0.6) < 0.05
    # Rango nulo → constante.
    assert np.all(sample_pert(rng, 0.4, 0.4, 0.4, 5) == 0.4)


def test_parse_price():
    assert parse_price("$297 (o 3 cuotas de $109)") == 297.0
    assert parse_price("29,90 €/mes") == 29.9
    assert parse_price("gratis") is None
    assert parse_price(None) is None


def test_reproducible_with_seed():
    r1 = run_simulation_v2(_rubric(0.6, 0.2), ARCHETYPES, n_iterations=2000, random_seed=7)
    r2 = run_simulation_v2(_rubric(0.6, 0.2), ARCHETYPES, n_iterations=2000, random_seed=7)
    assert r1["adoption"] == r2["adoption"]


def test_better_rubric_means_higher_adoption():
    weak = run_simulation_v2(_rubric(0.25, 0.1), ARCHETYPES, n_iterations=3000)
    strong = run_simulation_v2(_rubric(0.8, 0.1), ARCHETYPES, n_iterations=3000)
    assert strong["adoption"]["p50"] > weak["adoption"]["p50"] + 0.1


def test_wider_rubric_means_wider_band():
    narrow = run_simulation_v2(_rubric(0.5, 0.05), ARCHETYPES, n_iterations=3000)
    wide = run_simulation_v2(_rubric(0.5, 0.4), ARCHETYPES, n_iterations=3000)
    band = lambda r: r["adoption"]["p95"] - r["adoption"]["p5"]  # noqa: E731
    assert band(wide) > 3 * band(narrow)


def test_segments_are_not_averaged_and_shares_normalized():
    r = run_simulation_v2(_rubric(0.5, 0.1), ARCHETYPES, n_iterations=2000)
    assert [s["name"] for s in r["by_segment"]] == ["Early", "Pragmático"]
    assert sum(s["share"] for s in r["by_segment"]) == pytest.approx(1.0, abs=1e-3)
    # El adoptador temprano adopta más que el pragmático sensible al precio.
    assert r["by_segment"][0]["adoption"]["p50"] > r["by_segment"][1]["adoption"]["p50"]


def test_price_curve_is_monotonic_decreasing():
    r = run_simulation_v2(_rubric(0.5, 0.15), ARCHETYPES, price="$50/mes", n_iterations=2000)
    curve = r["price_curve"]
    assert [p["multiplier"] for p in curve] == [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
    assert curve[2]["price"] == 50.0
    means = [p["adoption_mean"] for p in curve]
    assert all(a >= b for a, b in zip(means, means[1:], strict=False))
    # Sin precio numérico no hay curva.
    assert run_simulation_v2(_rubric(0.5, 0.15), ARCHETYPES, n_iterations=500)["price_curve"] == []


def test_sensitivity_points_to_the_uncertain_dimension():
    raw = {k: {"score": 0.5, "low": 0.48, "high": 0.52} for k in DIMENSION_KEYS}
    raw["problem_severity"] = {"score": 0.5, "low": 0.1, "high": 0.9}  # la única duda real
    rubric = build_rubric(
        raw, key_assumptions=[], price=None, alternatives=None, channel=None,
        insights_raw=None, source="test",
    )
    r = run_simulation_v2(rubric, ARCHETYPES, n_iterations=3000)
    assert r["sensitivity"][0]["key"] == "problem_severity"
    assert r["sensitivity"][0]["importance"] > 0.5
    assert sum(s["importance"] for s in r["sensitivity"]) == pytest.approx(1.0, abs=1e-3)


def test_runs_with_heuristic_rubric_and_no_archetypes():
    rubric = HeuristicRubricEvaluator().evaluate("Una app de finanzas", "freelancers")
    r = run_simulation_v2(rubric, None, n_iterations=500)
    assert 0.0 < r["adoption"]["p50"] < 1.0
    assert len(r["by_segment"]) == 1
    assert 0.0 <= r["purchase_intent"]["p50"] <= r["adoption"]["p95"]
