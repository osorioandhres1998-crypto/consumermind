"""Utilidades de paralelización y reproducibilidad."""

from __future__ import annotations

import os

import numpy as np

#: Umbral por debajo del cual no merece la pena paralelizar (overhead > beneficio).
_PARALLEL_THRESHOLD = 2000


def resolve_n_jobs(n_jobs: int | None, n_iterations: int) -> int:
    """Determina el número de workers a usar.

    - Si ``n_jobs`` es explícito (>0), se respeta.
    - Si es ``-1``, se usan todas las CPU disponibles.
    - Si es ``None``, se decide automáticamente: 1 worker para cargas pequeñas
      (evita el overhead de ``joblib``) y varios para cargas grandes.
    """
    cpu = os.cpu_count() or 1
    if n_jobs is None:
        if n_iterations < _PARALLEL_THRESHOLD:
            return 1
        return max(1, min(cpu, 4))
    if n_jobs == -1:
        return cpu
    return max(1, int(n_jobs))


def chunk_indices(n_items: int, n_chunks: int) -> list[tuple[int, int]]:
    """Reparte ``n_items`` en ``n_chunks`` rangos ``(inicio, fin)`` contiguos."""
    bounds = np.linspace(0, n_items, n_chunks + 1, dtype=int)
    return [
        (int(bounds[i]), int(bounds[i + 1]))
        for i in range(n_chunks)
        if bounds[i + 1] > bounds[i]
    ]


def set_global_seed(seed: int | None) -> None:
    """Fija la semilla global de numpy (útil para scripts y notebooks)."""
    if seed is not None:
        np.random.seed(seed)
