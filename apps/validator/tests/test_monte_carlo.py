"""Pruebas del núcleo Monte Carlo: estructura, reproducibilidad y convergencia."""

import time

import pytest

from app.sim.monte_carlo import run_simulation


def _base_config(**overrides):
    cfg = {
        "n_iterations": 500,
        "population_size": 400,
        "adoption_prob_base": 0.3,
        "feature_weights": {"a": 1.0, "b": 0.5},
        "price_sensitivity": 1.0,
        "noise_distribution": {"type": "normal", "params": {"loc": 0.0, "scale": 1.0}},
        "random_seed": 42,
        "n_jobs": 1,
    }
    cfg.update(overrides)
    return cfg


def test_output_structure():
    result = run_simulation(_base_config())
    for key in (
        "acceptance_rate",
        "purchase_intent_probability",
        "top_objections",
        "feature_importance",
        "execution_metrics",
        "raw_samples",
    ):
        assert key in result

    acc = result["acceptance_rate"]
    assert {"mean", "std", "sem", "ci_95_lower", "ci_95_upper"} <= acc.keys()
    assert acc["ci_95_lower"] <= acc["mean"] <= acc["ci_95_upper"]


def test_reproducibility_same_seed():
    r1 = run_simulation(_base_config(random_seed=123))
    r2 = run_simulation(_base_config(random_seed=123))
    assert r1["acceptance_rate"]["mean"] == r2["acceptance_rate"]["mean"]
    assert r1["purchase_intent_probability"]["mean"] == (
        r2["purchase_intent_probability"]["mean"]
    )
    assert r1["raw_samples"][:5] == r2["raw_samples"][:5]


def test_different_seed_changes_results():
    r1 = run_simulation(_base_config(random_seed=1))
    r2 = run_simulation(_base_config(random_seed=2))
    assert r1["acceptance_rate"]["mean"] != r2["acceptance_rate"]["mean"]


def test_parallel_matches_serial():
    serial = run_simulation(_base_config(n_iterations=3000, n_jobs=1))
    parallel = run_simulation(_base_config(n_iterations=3000, n_jobs=2))
    assert serial["acceptance_rate"]["mean"] == pytest.approx(
        parallel["acceptance_rate"]["mean"], abs=1e-9
    )


def test_convergence_to_base_rate_without_effects():
    # Sin pesos, sin sensibilidad al precio y con ruido mínimo, la tasa de
    # aceptación debe converger a adoption_prob_base.
    cfg = _base_config(
        n_iterations=2000,
        population_size=2000,
        adoption_prob_base=0.35,
        feature_weights={"a": 0.0, "b": 0.0},
        price_sensitivity=0.0,
        noise_distribution={"type": "normal", "params": {"loc": 0.0, "scale": 0.01}},
        random_seed=7,
    )
    result = run_simulation(cfg)
    assert result["acceptance_rate"]["mean"] == pytest.approx(0.35, abs=0.02)


def test_top_objections_frequencies_sum_to_one():
    result = run_simulation(_base_config())
    freqs = sum(o["frequency"] for o in result["top_objections"])
    assert freqs == pytest.approx(1.0, abs=1e-6)


def test_feature_importance_normalized():
    result = run_simulation(_base_config())
    total = sum(f["importance"] for f in result["feature_importance"])
    assert total == pytest.approx(1.0, abs=1e-6)


def test_include_raw_samples_toggle():
    result = run_simulation(_base_config(include_raw_samples=False))
    assert result["raw_samples"] == []


def test_invalid_config_raises():
    with pytest.raises(ValueError):
        run_simulation(_base_config(n_iterations=-5))


def test_unsupported_noise_raises():
    with pytest.raises(ValueError):
        run_simulation(_base_config(noise_distribution={"type": "cauchy", "params": {}}))


def test_runtime_under_60s_for_1000_iterations():
    start = time.perf_counter()
    run_simulation(_base_config(n_iterations=1000, population_size=1000, n_jobs=1))
    elapsed = time.perf_counter() - start
    assert elapsed < 60.0


def test_raw_samples_have_expected_length():
    result = run_simulation(_base_config(n_iterations=250))
    assert len(result["raw_samples"]) == 250
    assert set(result["raw_samples"][0].keys()) == {
        "iteration",
        "acceptance_rate",
        "purchase_intent_rate",
        "n_adopters",
        "dominant_objection",
    }


def test_price_sensitivity_reduces_acceptance():
    low = run_simulation(_base_config(price_sensitivity=0.0, random_seed=99))
    high = run_simulation(_base_config(price_sensitivity=5.0, random_seed=99))
    assert high["acceptance_rate"]["mean"] < low["acceptance_rate"]["mean"]
