"""Configuración centralizada de logging para el backend."""

from __future__ import annotations

import logging
import os

_CONFIGURED = False


def _configure_root() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    )
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Devuelve un logger configurado de forma idempotente."""
    _configure_root()
    return logging.getLogger(name)
