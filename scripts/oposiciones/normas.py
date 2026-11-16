"""Convierte una norma consolidada del BOE en un JSON ligero que la web puede buscar."""

from __future__ import annotations

import xml.etree.ElementTree as ET

from .boe_client import BoeClient, ErrorBoe

# Bloques sin contenido propio que interese buscar (notas editoriales, firma, títulos y capítulos).
TIPOS_EXCLUIDOS = {"nota_inicial", "nota_pie", "firma", "encabezado", "indice"}


def necesita_actualizar(actual: dict | None, indice: list[dict]) -> bool:
    """Compara la huella guardada con la fecha de actualización más reciente del índice."""
    return actual is None or actual.get("huella") != _huella(indice)


def construir_norma(cliente: BoeClient, id_norma: str) -> dict:
    indice = cliente.indice(id_norma)
    bloques = _bloques_de(cliente, id_norma, indice)
    articulos = [
        {"id": b.id, "titulo": b.titulo, "parrafos": b.parrafos}
        for b in bloques
        if b.tipo not in TIPOS_EXCLUIDOS and b.parrafos
    ]
    return {
        "id": id_norma,
        "titulo": cliente.titulo_norma(id_norma),
        "huella": _huella(indice),
        "articulos": articulos,
    }


def _bloques_de(cliente: BoeClient, id_norma: str, indice: list[dict]):
    """Una sola petición con el texto completo; si falla, bloque a bloque."""
    try:
        return cliente.texto_completo(id_norma)
    except (ErrorBoe, ET.ParseError):
        pass
    bloques = []
    for entrada in indice:
        try:
            bloques.append(cliente.bloque(id_norma, entrada["id"]))
        except ErrorBoe:
            continue  # bloques sin texto propio o no disponibles
    return bloques


def comprobar_titulo(titulo_boe: str, esperado: str) -> bool:
    """True si el título que da el BOE contiene la referencia esperada (p. ej. '39/2015')."""
    return esperado in titulo_boe


def _huella(indice: list[dict]) -> str:
    return max((b.get("fecha_actualizacion", "") for b in indice), default="")
