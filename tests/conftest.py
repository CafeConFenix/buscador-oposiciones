import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def cargar_json():
    def _cargar(nombre):
        return json.loads((FIXTURES / nombre).read_text(encoding="utf-8"))

    return _cargar


@pytest.fixture
def cargar_bytes():
    def _cargar(nombre):
        return (FIXTURES / nombre).read_bytes()

    return _cargar


class AbrirFalso:
    """Sustituye a la función de red: responde según una tabla url -> (estado, cuerpo)."""

    def __init__(self, respuestas):
        self.respuestas = respuestas
        self.llamadas = []

    def __call__(self, url, accept):
        self.llamadas.append((url, accept))
        return self.respuestas.get(url, (404, b""))


@pytest.fixture
def abrir_falso():
    return AbrirFalso
