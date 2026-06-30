"""Validación del JWT emitido por el backend Node (master-tool).

El backend Express firma un JWT HS256 con ``BACKEND_JWT_SECRET`` y las claims
``{ sub, workspaceId, role }`` (ver apps/server/modules/auth/service.js). Aquí
lo verificamos para derivar el tenant en el microservicio Validator, de modo que
una sola sesión de usuario sirve para toda la plataforma.
"""

from __future__ import annotations

import os

import jwt
from fastapi import Header, HTTPException

JWT_SECRET = os.environ.get("BACKEND_JWT_SECRET", "")


class TenantContext:
    """Identidad del usuario derivada del token."""

    def __init__(self, workspace_id: str, user_id: str, role: str | None):
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.role = role


def require_tenant(authorization: str = Header(default="")) -> TenantContext:
    """Dependencia FastAPI: exige un Bearer token válido y devuelve el tenant."""
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="BACKEND_JWT_SECRET no configurado.")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado.")

    token = authorization[7:]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    workspace_id = claims.get("workspaceId")
    user_id = claims.get("sub")
    if not workspace_id:
        raise HTTPException(status_code=401, detail="Workspace no identificado en el token.")

    return TenantContext(workspace_id=workspace_id, user_id=user_id, role=claims.get("role"))
