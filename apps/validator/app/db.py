"""Persistencia en PostgreSQL (compartida con el backend Node).

Guarda las simulaciones del Validator en la tabla ``simulations``, respetando
el aislamiento multi-tenant por ``workspace_id`` mediante RLS: cada escritura
abre una transacción y fija ``SET LOCAL app.workspace_id`` antes del INSERT
(mismo patrón que api/middleware/workspace.js en el backend Node).
"""

from __future__ import annotations

import json
import os
from typing import Any

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "")


def _connect() -> psycopg.Connection:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no configurado.")
    return psycopg.connect(DATABASE_URL)


def user_in_workspace(workspace_id: str, user_id: str | None) -> bool:
    """Revocación real (Bloque 1.1): el JWT dura días; verificamos en DB que
    el usuario siga perteneciendo al workspace antes de aceptar la simulación."""
    if not user_id:
        return False
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM users WHERE id = %s AND workspace_id = %s",
                (user_id, workspace_id),
            )
            return cur.fetchone() is not None


def save_simulation(
    *,
    workspace_id: str,
    user_id: str | None,
    project_id: str | None,
    config: dict[str, Any],
    results: dict[str, Any],
    archetypes: list[Any] | None,
    insights: dict[str, Any] | None,
    audience_source: str | None,
) -> str:
    """Inserta una simulación finalizada y devuelve su id."""
    with _connect() as conn:
        with conn.cursor() as cur:
            # RLS: fija el tenant dentro de la transacción antes de escribir.
            cur.execute(
                "SELECT set_config('app.workspace_id', %s, true)", (workspace_id,)
            )
            cur.execute(
                """
                INSERT INTO simulations
                    (workspace_id, project_id, created_by, status, config,
                     results, archetypes, insights, audience_source)
                VALUES (%s, %s, %s, 'done', %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    workspace_id,
                    project_id,
                    user_id,
                    json.dumps(config),
                    json.dumps(results),
                    json.dumps(archetypes) if archetypes is not None else None,
                    json.dumps(insights) if insights is not None else None,
                    audience_source,
                ),
            )
            sim_id = cur.fetchone()[0]
        conn.commit()
    return str(sim_id)
