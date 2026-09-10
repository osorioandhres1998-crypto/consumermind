"""Pruebas de la calibración de priors (Fase 4)."""

from app.sim.priors import PRIOR_PSEUDO_N, VERTICAL_PRIORS, resolve_prior


def test_no_calibration_keeps_reference():
    p = resolve_prior("saas", None)
    assert p["p0"] == VERTICAL_PRIORS["saas"]["p0"] and p["calibrated_n"] == 0


def test_calibration_is_weighted_mean_and_clamped():
    ref = VERTICAL_PRIORS["saas"]["p0"]
    p = resolve_prior("saas", {"n": 5, "observed_mean": 0.05})
    assert p["p0"] == round((PRIOR_PSEUDO_N * ref + 5 * 0.05) / (PRIOR_PSEUDO_N + 5), 4)
    assert p["calibrated_n"] == 5 and p["p0_reference"] == ref and "calibrado" in p["note"]
    assert resolve_prior("saas", {"n": 100, "observed_mean": 1.0})["p0"] <= 0.95
    assert resolve_prior("saas", {"n": 0, "observed_mean": 0.9})["calibrated_n"] == 0
