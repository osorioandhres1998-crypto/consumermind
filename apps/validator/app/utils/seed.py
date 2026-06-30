"""Helpers de reproducibilidad basados en SeedSequence.

Centraliza la creación de streams aleatorios independientes para garantizar
que una misma ``random_seed`` produzca siempre los mismos resultados, con
independencia del número de workers usados en la paralelización.
"""

from __future__ import annotations

import numpy as np


def spawn_child_seeds(random_seed: int | None, n: int) -> list[np.random.SeedSequence]:
    """Genera ``n`` SeedSequence hijas independientes a partir de la semilla."""
    return list(np.random.SeedSequence(random_seed).spawn(n))


def make_rng(random_seed: int | None) -> np.random.Generator:
    """Crea un generador numpy a partir de una semilla (o aleatorio si None)."""
    return np.random.default_rng(random_seed)
