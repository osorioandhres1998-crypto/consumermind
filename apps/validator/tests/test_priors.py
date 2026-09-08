"""Pruebas de los priors por vertical (Fase 2.1)."""

from app.llm.rubric import DIMENSION_KEYS, build_rubric
from app.sim.monte_carlo_v2 import run_simulation_v2
from app.sim.priors import GENERIC_KEY, VERTICAL_PRIORS, resolve_prior


def _rubric(score=0.5, half=0.1):
    raw = {k: {"score": score, "low": score - half, "high": score + half} for k in DIMENSION_KEYS}
    return build_rubric(raw, key_assumptions=[], price=None, alternatives=None, channel=None,
                        insights_raw=None, source="test")


def test_resolve_prior_known_unknown_and_case():
    assert resolve_prior("saas")["vertical"] == "saas"
    assert resolve_prior(" SaaS ")["vertical"] == "saas"
    assert resolve_prior("inexistente")["vertical"] == GENERIC_KEY
    assert resolve_prior(None)["vertical"] == GENERIC_KEY
    assert resolve_prior(None)["p0"] == 0.20  # mismo prior que antes de la Fase 2.1


def test_all_priors_are_sane():
    for key, p in VERTICAL_PRIORS.items():
        assert 0.0 < p["p0"] < 1.0, key
        assert p["price_k"] > 0 and p["k"] > 0, key
        assert p["label"] and p["note"], key


def test_vertical_changes_adoption_in_expected_order():
    r = {v: run_simulation_v2(_rubric(), None, vertical=v, n_iterations=2000) for v in ("ecommerce", "saas", "servicios")}
    assert r["ecommerce"]["adoption"]["p50"] > r["saas"]["adoption"]["p50"] > r["servicios"]["adoption"]["p50"]
    assert r["saas"]["assumptions"]["vertical"] == "saas"
    assert r["saas"]["assumptions"]["prior_adoption_p0"] == VERTICAL_PRIORS["saas"]["p0"]


def test_generic_prior_matches_no_vertical():
    a = run_simulation_v2(_rubric(), None, n_iterations=1000)
    b = run_simulation_v2(_rubric(), None, vertical="", n_iterations=1000)
    c = run_simulation_v2(_rubric(), None, vertical="otro", n_iterations=1000)
    assert a["adoption"] == b["adoption"] == c["adoption"]
    assert a["assumptions"]["vertical"] == GENERIC_KEY
