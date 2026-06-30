"""Punto de entrada de la aplicación FastAPI del MVP Validator."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# CORS abierto para facilitar la integración con el frontend Next.js en local.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/", tags=["meta"])
def root() -> dict:
    """Mensaje de bienvenida con enlaces útiles."""
    return {
        "service": "mvp-validator-backend",
        "docs": "/docs",
        "health": "/health",
    }
