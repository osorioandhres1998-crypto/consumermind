"""Cliente ligero para la API de Claude (Anthropic) con degradación elegante.

El objetivo es que TODO el flujo funcione también *sin* clave de API ni el SDK
instalado: en ese caso ``is_available()`` devuelve ``False`` y las capas
superiores usan un generador heurístico determinista (ver
``app.llm.profiles``). Así las pruebas y la CI no dependen de la red.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from app.utils.logging import get_logger

logger = get_logger(__name__)

#: Modelo por defecto. Configurable con la variable de entorno ``LLM_MODEL``.
DEFAULT_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-6")


def is_available() -> bool:
    """Indica si se puede usar Claude (hay clave y el SDK está instalado)."""
    if not os.getenv("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        logger.warning(
            "ANTHROPIC_API_KEY presente pero el paquete 'anthropic' no está instalado."
        )
        return False
    return True


def extract_json(text: str) -> Any:
    """Extrae el primer objeto/array JSON de una respuesta de texto.

    Tolera bloques de código markdown (```json ... ```) y texto adicional
    alrededor del JSON.
    """
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        starts = [i for i in (text.find("{"), text.find("[")) if i != -1]
        start = min(starts) if starts else -1
        end = max(text.rfind("}"), text.rfind("]"))
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


class ClaudeClient:
    """Envoltura mínima sobre ``anthropic.Anthropic.messages.create``."""

    def __init__(self, model: str | None = None, api_key: str | None = None):
        from anthropic import Anthropic  # import perezoso

        self.model = model or DEFAULT_MODEL
        self._client = Anthropic(api_key=api_key or os.getenv("ANTHROPIC_API_KEY"))

    def complete(
        self,
        system: str,
        prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.4,
    ) -> str:
        """Devuelve el texto de la respuesta de Claude."""
        message = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(
            block.text
            for block in message.content
            if getattr(block, "type", None) == "text"
        )

    def complete_json(self, system: str, prompt: str, **kwargs: Any) -> Any:
        """Igual que ``complete`` pero parsea la respuesta como JSON."""
        return extract_json(self.complete(system, prompt, **kwargs))
