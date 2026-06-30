"""Configuración compartida de pytest.

Asegura que el paquete ``app`` sea importable al ejecutar las pruebas desde
la raíz de ``backend/``.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
