"""Punto de entrada de la aplicación FastAPI del MVP Validator."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.integration import router as integration_router
from app.api.routes import router

app = FastAPI(
    title="MVP Validator API",
    description=(
        "API para validar ideas de producto mediante audiencias simuladas. "
        "Ejecuta simulaciones Monte Carlo que estiman aceptación de mercado, "
        "intención de compra, objeciones y características más valoradas."
    ),
    version="0.1.0",
)

# CORS (Bloque 1.4): restringido a WEB_ORIGIN en producción. En la práctica
# el navegador nunca llama directo (todo pasa por el proxy server-side de
# Next, donde CORS no aplica), pero cerrar el origen es higiene básica.
# Sin WEB_ORIGIN definida (desarrollo local) se mantiene abierto.
import os

_web_origin = os.environ.get("WEB_ORIGIN")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_web_origin] if _web_origin else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(integration_router)


@app.get("/", tags=["meta"])
def root() -> dict:
    """Mensaje de bienvenida con enlaces útiles."""
    return {
        "service": "mvp-validator-backend",
        "docs": "/docs",
        "health": "/health",
    }
