"""Pruebas del recomendador de experimentos (Fase 3.1)."""

from app.sim.experiments import CATALOG, recommend_experiments


def test_catalog_is_complete():
    for k, e in CATALOG.items():
        assert e["name"] and e["metric"] and e["threshold"] and e["effort"] and e["how"], k


def test_no_user_evidence_starts_with_interviews_and_ends_with_payment():
    r = recommend_experiments(
        {"confidence": "baja", "evidence_sources": []},
        {"sensitivity": [{"key": "differentiation", "label": "Diferenciación", "importance": 0.4}]},
        {"objections": [{"category": "precio", "label": "El precio no compensa", "share": 0.5}]},
        has_price=True,
    )
    keys = [e["key"] for e in r["experiments"]]
    assert keys[0] == "interviews" and "smoke_landing" in keys and "price_test" in keys and "fake_door" in keys
    assert [e["priority"] for e in r["experiments"]] == [1, 2, 3, 4]
    assert len(keys) == len(set(keys)) <= 4


def test_with_user_evidence_and_no_price():
    r = recommend_experiments(
        {"confidence": "media", "evidence_sources": ["usuario"]},
        {"sensitivity": [{"key": "willingness_to_pay", "label": "Disposición a pagar", "importance": 0.6}]},
        None,
        has_price=False,
    )
    keys = [e["key"] for e in r["experiments"]]
    assert "interviews" not in keys and keys[0] == "price_test" and "fake_door" not in keys


def test_handles_missing_inputs():
    r = recommend_experiments(None, None, None, has_price=False)
    assert [e["key"] for e in r["experiments"]] == ["interviews", "price_test"]
