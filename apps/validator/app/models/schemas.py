"""Modelos pydantic (v2) para validar configuración y respuestas de la API."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class SimulationStatus(str, Enum):
    """Estados posibles del ciclo de vida de una simulación."""

    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class NoiseDistribution(BaseModel):
    """Distribución de ruido aplicada al modelo de adopción."""

    type: Literal["normal", "uniform", "lognormal", "gumbel"] = "normal"
    params: dict[str, float] = Field(default_factory=lambda: {"loc": 0.0, "scale": 1.0})


class SimulationConfig(BaseModel):
    """Configuración de entrada para ``run_simulation``.

    Los valores por defecto coinciden con el payload sugerido en la
    documentación: ``n_iterations=10000``, ``population_size=1000``,
    ``random_seed=42``.
    """

    n_iterations: int = Field(10000, ge=1, le=1_000_000)
    population_size: int = Field(1000, ge=1, le=1_000_000)
    adoption_prob_base: float = Field(0.2, gt=0.0, lt=1.0)
    feature_weights: dict[str, float] = Field(
        default_factory=lambda: {
            "usabilidad": 1.0,
            "diseno": 0.7,
            "innovacion": 0.9,
            "soporte": 0.5,
            "confiabilidad": 0.8,
        }
    )
    price_sensitivity: float = Field(1.0, ge=0.0)
    noise_distribution: NoiseDistribution = Field(default_factory=NoiseDistribution)
    random_seed: int | None = Field(42)
    include_raw_samples: bool = True
    n_jobs: int | None = Field(None)

    @field_validator("feature_weights")
    @classmethod
    def _non_empty_weights(cls, value: dict[str, float]) -> dict[str, float]:
        if not value:
            raise ValueError("feature_weights no puede estar vacío.")
        return value

    def to_engine_config(self) -> dict[str, Any]:
        """Serializa a un dict plano consumible por ``run_simulation``."""
        return self.model_dump()


class SimulationOverrides(BaseModel):
    """Parámetros de simulación opcionales para el análisis de una idea."""

    n_iterations: int | None = Field(None, ge=1, le=1_000_000)
    population_size: int | None = Field(None, ge=1, le=1_000_000)
    random_seed: int | None = None
    include_raw_samples: bool | None = None
    n_jobs: int | None = None


class IdeaAnalysisRequest(BaseModel):
    """Petición para analizar una idea de producto generando audiencias con IA."""

    idea: str = Field(
        ..., min_length=10, description="Descripción de la idea de producto."
    )
    target_audience: str = Field(
        ..., min_length=3, description="Público objetivo (demografía, contexto, etc.)."
    )
    n_archetypes: int = Field(8, ge=1, le=12)
    simulation: SimulationOverrides | None = None


class MetricSummary(BaseModel):
    """Resumen de una métrica con intervalo de confianza al 95 %."""

    mean: float
    std: float
    sem: float
    ci_95_lower: float
    ci_95_upper: float


class ObjectionItem(BaseModel):
    objection: str
    count: int
    frequency: float


class FeatureImportanceItem(BaseModel):
    feature: str
    sensitivity: float
    importance: float


class CreateSimulationResponse(BaseModel):
    simulation_id: str
    status: SimulationStatus


class SimulationStatusResponse(BaseModel):
    simulation_id: str
    status: SimulationStatus
    created_at: float
    started_at: float | None = None
    finished_at: float | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "mvp-validator-backend"
    version: str = "0.1.0"


class SamplesPage(BaseModel):
    simulation_id: str
    page: int
    limit: int
    total: int
    total_pages: int
    items: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Módulo Audience Research (Jobs-to-be-Done)
# ---------------------------------------------------------------------------


class AudienceResearchRequest(BaseModel):
    """Petición para modelar la demanda de un producto con JTBD."""

    product: str = Field(
        ..., min_length=10, description="Producto o servicio que se vende."
    )
    audience_hint: str | None = Field(
        None, description="Hipótesis opcional de a quién se dirige."
    )
    insights_raw: str | None = Field(
        None,
        description="Insights reales opcionales (ventas, soporte, redes) para anclar.",
    )


class AudienceSegment(BaseModel):
    """Un segmento de audiencia con su situación gatillo, jobs e insights."""

    segment: str
    is_hypothesis: bool = True
    trigger_situation: str = ""
    trigger_event: str = ""
    best_timing: str = ""
    job_functional: str = ""
    job_emotional: str = ""
    job_social: str = ""
    sales_questions: str = ""
    support_frustrations: str = ""
    social_listening: str = ""
    main_pain: str = ""
    main_desire: str = ""
    evidence: str = "hipótesis"


class AudienceResearchResponse(BaseModel):
    """Resultado del módulo Audience Research."""

    summary: str
    segments: list[AudienceSegment]
    source: str
