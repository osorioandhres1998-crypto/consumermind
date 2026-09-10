"""Endpoint integrado con el master-tool (síncrono + persistencia).

A diferencia de los endpoints async originales (cola + polling), este corre la
simulación de una vez y guarda el resultado en la Postgres compartida, atado al
``workspace_id`` (del JWT) y al ``project_id`` (del proyecto). Es el camino que
consume el frontend Next.js unificado.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.jwt import TenantContext, require_tenant
from app.db import calibration_for, save_outcome, save_simulation, user_in_workspace
from app.llm.audience_research import get_audience_researcher
from app.llm.config_builder import build_simulation_plan
from app.llm.demand_signals import get_demand_signals
from app.llm.personas import get_persona_panel
from app.llm.rubric import get_rubric_evaluator
from app.sim.experiments import recommend_experiments
from app.sim.monte_carlo_v2 import run_simulation_v2
from app.models.schemas import IdeaAnalysisRequest
from app.sim.monte_carlo import run_simulation
from app.utils.logging import get_logger

router = APIRouter(tags=["integration"])
logger = get_logger(__name__)


def _run_and_store(request: IdeaAnalysisRequest, tenant: TenantContext, project_id: str | None) -> dict:
    """Lógica compartida: valida el acceso, corre Monte Carlo, genera insights
    y persiste. project_id=None ⇒ simulación 'rápida' sin proyecto (standalone).
    """
    # Revocación real (Bloque 1.1): no basta el JWT — el usuario debe seguir
    # perteneciendo al workspace en la base de datos.
    try:
        if not user_in_workspace(tenant.workspace_id, tenant.user_id):
            raise HTTPException(status_code=401, detail="Tu acceso a este workspace fue revocado.")
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 - DB caída: no bloquear con 500 críptico
        logger.exception("No se pudo verificar la pertenencia al workspace")
        raise HTTPException(status_code=503, detail="No se pudo verificar tu acceso. Intenta de nuevo.")

    overrides = request.simulation.model_dump() if request.simulation else None

    # Fase 2.3 — Audience Research (JTBD) como paso previo: los segmentos de
    # demanda generan los arquetipos (uno por segmento) y dan contexto al
    # panel de personas. Opcional: si falla, los arquetipos se generan como antes.
    research = None
    try:
        research = get_audience_researcher().research(
            product=request.idea,
            audience_hint=request.target_audience,
            insights_raw=request.insights_raw,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Falló Audience Research project=%s", project_id)

    plan = build_simulation_plan(
        idea=request.idea,
        target_audience=request.target_audience,
        n_archetypes=request.n_archetypes,
        simulation_overrides=overrides,
        segments=(research or {}).get("segments"),
    )

    try:
        full = run_simulation(plan["config"])
    except Exception as exc:  # noqa: BLE001 - se reporta al cliente
        logger.exception("Simulación fallida project=%s", project_id)
        raise HTTPException(status_code=502, detail=f"La simulación falló: {exc}")

    full.pop("raw_samples", None)  # no persistimos las muestras crudas aquí
    if research:
        full["audience_research"] = research

    # Fase 2.2 — señales de demanda externas (Bright Data + Claude). Opcional:
    # sin token degrada a source="none" y la rúbrica sigue sin evidencia web.
    external_evidence = None
    try:
        full["signals"] = get_demand_signals().collect(
            request.idea, request.target_audience, alternatives=request.alternatives
        )
        external_evidence = full["signals"].get("evidence_text") or None
    except Exception:  # noqa: BLE001
        logger.exception("Fallaron las señales de demanda project=%s", project_id)

    # Fase 1.1 — rúbrica con incertidumbre explícita. Viaja dentro de `results`
    # para persistirse sin tocar el esquema de `simulations`. Opcional: si falla
    # no rompe la simulación (el evaluador ya degrada a heurística por dentro).
    try:
        full["rubric"] = get_rubric_evaluator().evaluate(
            request.idea,
            request.target_audience,
            price=request.price,
            alternatives=request.alternatives,
            channel=request.channel,
            insights_raw=request.insights_raw,
            external_evidence=external_evidence,
        )
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo evaluar la rúbrica project=%s", project_id)

    # Fase 1.2 — Monte Carlo v2: propaga la incertidumbre de la rúbrica por
    # segmento, con el precio real. Convive con el v1 hasta que la UI lo
    # retire (Fase 1.4). Opcional: si falla, no rompe la respuesta.
    if full.get("rubric"):
        # Fase 4: prior calibrado con resultados reales del workspace (si hay).
        calibration = None
        try:
            calibration = calibration_for(tenant.workspace_id, request.vertical)
        except Exception:  # noqa: BLE001 - sin DB no hay calibración, no rompe
            logger.exception("No se pudo leer la calibración project=%s", project_id)
        try:
            full["v2"] = run_simulation_v2(
                full["rubric"],
                plan.get("archetypes", []),
                price=request.price,
                vertical=request.vertical,
                calibration=calibration,
                n_iterations=int(plan["config"].get("n_iterations", 10000)),
                random_seed=plan["config"].get("random_seed", 42),
            )
        except Exception:  # noqa: BLE001
            logger.exception("Falló el Monte Carlo v2 project=%s", project_id)

    # Fase 1.3 — panel de personas sintéticas: objeciones específicas al
    # producto en vez de las 3 etiquetas fijas del v1. Opcional.
    try:
        full["panel"] = get_persona_panel().respond(
            request.idea,
            request.target_audience,
            plan.get("archetypes", []),
            price=request.price,
            alternatives=request.alternatives,
            channel=request.channel,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Falló el panel de personas project=%s", project_id)

    # Fase 3.1 — experimentos recomendados (determinista, sin LLM).
    try:
        full["experiments"] = recommend_experiments(
            full.get("rubric"), full.get("v2"), full.get("panel"),
            has_price=bool(request.price and request.price.strip()),
        )
    except Exception:  # noqa: BLE001
        logger.exception("Falló el recomendador de experimentos project=%s", project_id)

    # Insights en lenguaje natural (Claude si hay clave; si no, heurística).
    insights = None
    try:
        from app.llm.profiles import get_profile_generator

        generator = get_profile_generator()
        # Fase 1.4: los insights se basan en el panel (objeciones reales al
        # producto) y en la adopción del v2, no en las etiquetas fijas del v1.
        panel_obj = (full.get("panel") or {}).get("objections") or []
        objections_src = (
            [{"objection": o["label"], "frequency": o["share"]} for o in panel_obj]
            or full.get("top_objections", [])
        )
        v2 = full.get("v2")
        metrics_src = (
            {
                "acceptance_rate": {"mean": v2["adoption"]["p50"]},
                "purchase_intent_probability": {"mean": v2["purchase_intent"]["p50"]},
            }
            if v2
            else full
        )
        insights = generator.explain_objections(request.idea, objections_src, metrics_src)
    except Exception:  # noqa: BLE001 - los insights son opcionales
        logger.exception("No se pudieron generar insights project=%s", project_id)

    archetypes = plan.get("archetypes", [])
    audience_source = plan.get("source")

    try:
        sim_id = save_simulation(
            workspace_id=tenant.workspace_id,
            user_id=tenant.user_id,
            project_id=project_id,  # None en modo standalone (columna nullable)
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


@router.post("/projects/{project_id}/validate")
def validate_for_project(
    project_id: str,
    request: IdeaAnalysisRequest,
    tenant: TenantContext = Depends(require_tenant),
) -> dict:
    """Corre la simulación atada a un proyecto y persiste el resultado."""
    return _run_and_store(request, tenant, project_id)


@router.post("/validate")
def validate_standalone(
    request: IdeaAnalysisRequest,
    tenant: TenantContext = Depends(require_tenant),
) -> dict:
    """Simulación 'rápida' sin proyecto (herramienta standalone del hub)."""
    return _run_and_store(request, tenant, None)


# ---------------------------------------------------------------------------
# Fase 4 — registrar el resultado real de un experimento
# ---------------------------------------------------------------------------


class OutcomeRequest(BaseModel):
    experiment_key: str = Field(..., min_length=2, max_length=40)
    observed_rate: float | None = Field(None, ge=0.0, le=1.0)
    estimated_rate: float | None = Field(None, ge=0.0, le=1.0)
    success: bool | None = None
    simulation_id: str | None = None
    vertical: str | None = None
    note: str | None = Field(None, max_length=500)


@router.post("/projects/{project_id}/outcomes")
def record_outcome(
    project_id: str,
    request: OutcomeRequest,
    tenant: TenantContext = Depends(require_tenant),
) -> dict:
    """Guarda un resultado real; a partir de ahí calibra los priors del workspace."""
    try:
        if not user_in_workspace(tenant.workspace_id, tenant.user_id):
            raise HTTPException(status_code=401, detail="Tu acceso a este workspace fue revocado.")
        out_id = save_outcome(
            workspace_id=tenant.workspace_id,
            user_id=tenant.user_id,
            project_id=project_id,
            simulation_id=request.simulation_id,
            vertical=request.vertical,
            experiment_key=request.experiment_key,
            observed_rate=request.observed_rate,
            estimated_rate=request.estimated_rate,
            success=request.success,
            note=request.note,
        )
        calibration = calibration_for(tenant.workspace_id, request.vertical)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("No se pudo guardar el resultado project=%s", project_id)
        raise HTTPException(status_code=503, detail=f"No se pudo guardar: {exc}")
    return {"outcome_id": out_id, "calibration": calibration}
