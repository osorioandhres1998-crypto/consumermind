"""Almacén en memoria y ejecutor de simulaciones.

Implementa una cola de trabajo sencilla basada en un ``ThreadPoolExecutor``.
Es deliberadamente *in-memory* para el MVP inicial; el diseño deja claro el
punto de extensión para migrar a una cola real (Celery/RQ) y persistencia en
PostgreSQL en iteraciones futuras.
"""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.models.schemas import SimulationStatus
from app.sim.monte_carlo import run_simulation
from app.utils.logging import get_logger

logger = get_logger(__name__)


class SimulationRecord:
    """Estado y resultados de una simulación individual."""

    def __init__(
        self,
        simulation_id: str,
        config: dict[str, Any],
        meta: dict[str, Any] | None = None,
    ):
        self.id = simulation_id
        self.config = config
        # Metadatos opcionales del análisis de idea (idea, audiencia,
        # arquetipos, source). Si está presente, tras la simulación se generan
        # insights en lenguaje natural.
        self.meta = meta or {}
        self.status: SimulationStatus = SimulationStatus.QUEUED
        self.created_at = time.time()
        self.started_at: float | None = None
        self.finished_at: float | None = None
        self.error: str | None = None
        self.result: dict[str, Any] | None = None
        self.raw_samples: list[dict[str, Any]] = []
        self.insights: dict[str, Any] | None = None


class SimulationStore:
    """Registro thread-safe de simulaciones con ejecución asíncrona."""

    def __init__(self, max_workers: int = 2):
        self._records: dict[str, SimulationRecord] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers)

    # -- Creación / consulta -------------------------------------------------

    def create(
        self, config: dict[str, Any], meta: dict[str, Any] | None = None
    ) -> SimulationRecord:
        simulation_id = uuid.uuid4().hex
        record = SimulationRecord(simulation_id, config, meta)
        with self._lock:
            self._records[simulation_id] = record
        self._executor.submit(self._run, simulation_id)
        logger.info("Simulación encolada id=%s", simulation_id)
        return record

    def get(self, simulation_id: str) -> SimulationRecord | None:
        with self._lock:
            return self._records.get(simulation_id)

    # -- Ejecución -----------------------------------------------------------

    def _run(self, simulation_id: str) -> None:
        record = self.get(simulation_id)
        if record is None:
            return
        record.status = SimulationStatus.RUNNING
        record.started_at = time.time()
        try:
            full = run_simulation(record.config)
            record.raw_samples = full.pop("raw_samples", [])
            record.result = full
            # Si la simulación procede del análisis de una idea, generamos
            # insights en lenguaje natural (Claude o heurística).
            if record.meta.get("idea"):
                record.insights = self._build_insights(record, full)
            record.status = SimulationStatus.DONE
            logger.info("Simulación completada id=%s", simulation_id)
        except Exception as exc:  # noqa: BLE001 - se persiste el error para el cliente
            record.error = f"{type(exc).__name__}: {exc}"
            record.status = SimulationStatus.FAILED
            logger.exception("Simulación fallida id=%s", simulation_id)
        finally:
            record.finished_at = time.time()

    def _build_insights(
        self, record: SimulationRecord, result: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Genera el resumen accionable para una simulación basada en idea."""
        # Import perezoso para no acoplar el store al módulo LLM en cargas
        # que no lo necesitan.
        from app.llm.profiles import get_profile_generator

        try:
            generator = get_profile_generator()
            return generator.explain_objections(
                record.meta["idea"],
                result.get("top_objections", []),
                result,
            )
        except Exception:  # noqa: BLE001 - los insights son opcionales
            logger.exception("No se pudieron generar insights id=%s", record.id)
            return None

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False)


#: Instancia global usada por la app FastAPI.
store = SimulationStore()
