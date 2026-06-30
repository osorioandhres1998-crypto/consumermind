"""Endpoint integrado con el master-tool (síncrono + persistencia).

A diferencia de los endpoints async originales (cola + polling), este corre la
simulación de una vez y guarda el resultado en la Postgres compartida, atado al
``workspace_id`` (del JWT) y al ``project_id`` (del proyecto). Es el camino que
consume el frontend Next.js unificado.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth.jwt import TenantContext, require_tenant
from app.db import save_simulation
from app.llm.config_builder import build_simulation_plan
from app.models.schemas import IdeaAnalysisRequest
from app.sim.monte_carlo import run_simulation
from app.utils.logging import get_logger

router = APIRouter(tags=["integration"])
logger = get_logger(__name__)


@router.post("/projects/{project_id}/validate")
def validate_for_project(
    project_id: str,
    request: IdeaAnalysisRequest,
    tenant: TenantContext = Depends(require_tenant),
) -> dict:
    """Corre la simulación para un proyecto y persiste el resultado.

    Genera arquetipos (IA o heurística), ejecuta Monte Carlo de forma síncrona,
    construye insights y guarda todo en ``simulations``. Devuelve el resultado
    completo listo para pintar en el frontend.
    """
    overrides = request.simulation.model_dump() if request.simulation else None
    plan = build_simulation_plan(
        idea=request.idea,
        target_audience=request.target_audience,
        n_archetypes=request.n_archetypes,
        simulation_overrides=overrides,
    )

    try:
        full = run_simulation(plan["config"])
    except Exception as exc:  # noqa: BLE001 - se reporta al cliente
        logger.exception("Simulación fallida project=%s", project_id)
        raise HTTPException(status_code=502, detail=f"La simulación falló: {exc}")

    full.pop("raw_samples", None)  # no persistimos las muestras crudas aquí

    # Insights en lenguaje natural (Claude si hay clave; si no, heurística).
    insights = None
    try:
        from app.llm.profiles import get_profile_generator

        generator = get_profile_generator()
        insights = generator.explain_objections(
            request.idea, full.get("top_objections", []), full
        )
    except Exception:  # noqa: BLE001 - los insights son opcionales
        logger.exception("No se pudieron generar insights project=%s", project_id)

    archetypes = plan.get("archetypes", [])
    audience_source = plan.get("source")

    try:
        sim_id = save_simulation(
            workspace_id=tenant.workspace_id,
            user_id=tenant.user_id,
            project_id=project_id,
            config=plan["config"],
            results=full,
            archetypes=archetypes,
            insights=insights,
            audience_source=audience_source,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("No se pudo guardar la simulación project=%s", project_id)
        raise HTTPException(status_code=503, detail=f"No se pudo guardar: {exc}")

    return {
        "simulation_id": sim_id,
        "idea": request.idea,
        "target_audience": request.target_audience,
        "archetypes": archetypes,
        "audience_source": audience_source,
        "insights": insights,
        **full,
    }
