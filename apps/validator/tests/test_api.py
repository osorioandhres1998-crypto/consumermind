"""Pruebas de integración de los endpoints FastAPI."""

import time

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SMALL_CONFIG = {
    "n_iterations": 200,
    "population_size": 200,
    "random_seed": 42,
    "n_jobs": 1,
}


def _wait_until_done(simulation_id: str, timeout: float = 30.0) -> str:
    deadline = time.time() + timeout
    status = "queued"
    while time.time() < deadline:
        resp = client.get(f"/simulations/{simulation_id}/status")
        status = resp.json()["status"]
        if status in ("done", "failed"):
            return status
        time.sleep(0.1)
    return status


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_root():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "docs" in resp.json()


def test_full_simulation_flow():
    # Crear
    resp = client.post("/simulations", json=SMALL_CONFIG)
    assert resp.status_code == 202
    body = resp.json()
    sim_id = body["simulation_id"]
    assert body["status"] in ("queued", "running", "done")

    # Esperar a que termine
    status = _wait_until_done(sim_id)
    assert status == "done"

    # Resultados
    resp = client.get(f"/simulations/{sim_id}/results")
    assert resp.status_code == 200
    results = resp.json()
    assert "acceptance_rate" in results
    assert "top_objections" in results
    assert results["simulation_id"] == sim_id

    # Muestras paginadas
    resp = client.get(f"/simulations/{sim_id}/samples", params={"limit": 50, "page": 1})
    assert resp.status_code == 200
    page = resp.json()
    assert page["limit"] == 50
    assert len(page["items"]) == 50
    assert page["total"] == 200
    assert page["total_pages"] == 4


def test_status_not_found():
    resp = client.get("/simulations/does-not-exist/status")
    assert resp.status_code == 404


def test_results_not_found():
    resp = client.get("/simulations/does-not-exist/results")
    assert resp.status_code == 404


def test_invalid_config_rejected():
    resp = client.post("/simulations", json={"n_iterations": 0})
    assert resp.status_code == 422


def test_analyze_idea_flow(monkeypatch):
    # Sin clave de API => se usa la heurística determinista (sin red).
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    payload = {
        "idea": "Plataforma que valida ideas de producto con audiencias simuladas por IA.",
        "target_audience": "Startups B2B y equipos de producto en LATAM.",
        "n_archetypes": 6,
        "simulation": {"n_iterations": 200, "population_size": 200, "n_jobs": 1},
    }
    resp = client.post("/ideas/analyze", json=payload)
    assert resp.status_code == 202
    sim_id = resp.json()["simulation_id"]

    assert _wait_until_done(sim_id) == "done"

    results = client.get(f"/simulations/{sim_id}/results").json()
    assert results["audience_source"] == "heuristic"
    assert len(results["archetypes"]) == 6
    assert "acceptance_rate" in results
    assert results["insights"] is not None
    assert "summary" in results["insights"]


def test_analyze_idea_validation():
    # idea demasiado corta => 422
    resp = client.post("/ideas/analyze", json={"idea": "corta", "target_audience": "abc"})
    assert resp.status_code == 422


def test_samples_second_page():
    resp = client.post("/simulations", json=SMALL_CONFIG)
    sim_id = resp.json()["simulation_id"]
    assert _wait_until_done(sim_id) == "done"
    resp = client.get(f"/simulations/{sim_id}/samples", params={"limit": 150, "page": 2})
    page = resp.json()
    assert len(page["items"]) == 50  # 200 muestras, 150 en pág. 1, 50 en pág. 2
    assert page["page"] == 2
