"""Convierte una norma consolidada del BOE en un JSON ligero que la web puede buscar."""

from __future__ import annotations

from .boe_client import BoeClient, ErrorBoe

TIPOS_INCLUIDOS = {"precepto", "preambulo"}


def necesita_actualizar(actual: dict | None, indice: list[dict]) -> bool:
    """Compara la huella guardada con la fecha de actualización más reciente del índice."""
    return actual is None or actual.get("huella") != _huella(indice)


def construir_norma(cliente: BoeClient, id_norma: str) -> dict:
    indice = cliente.indice(id_norma)
    articulos = []
    for entrada in indice:
        try:
            bloque = cliente.bloque(id_norma, entrada["id"])
        except ErrorBoe:
            continue  # bloques sin texto propio (notas, firma…) o no disponibles
        if bloque.tipo not in TIPOS_INCLUIDOS:
            continue
        articulos.append({"id": bloque.id, "titulo": bloque.titulo, "parrafos": bloque.parrafos})
    return {
        "id": id_norma,
        "titulo": cliente.titulo_norma(id_norma),
        "huella": _huella(indice),
        "articulos": articulos,
    }


def comprobar_titulo(titulo_boe: str, esperado: str) -> bool:
    """True si el título que da el BOE contiene la referencia esperada (p. ej. '39/2015')."""
    return esperado in titulo_boe


def _huella(indice: list[dict]) -> str:
    return max((b.get("fecha_actualizacion", "") for b in indice), default="")
