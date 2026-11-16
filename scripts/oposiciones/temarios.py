"""Temario oficial (anexos del BOE) y comprobación de enlaces del catálogo."""

from __future__ import annotations

import re
from typing import Callable

_TEMA = re.compile(r"^\s*tema\s+(\d{1,3})\s*[.\-–—:]?\s*(.+?)\s*$", re.IGNORECASE)


def extraer_temas(texto: str) -> list[dict]:
    """Líneas 'Tema N. título' de un anexo; si un número se repite, se conserva la primera."""
    vistos: set[int] = set()
    temas: list[dict] = []
    for linea in texto.splitlines():
        m = _TEMA.match(linea)
        if not m:
            continue
        numero = int(m.group(1))
        if numero in vistos:
            continue
        vistos.add(numero)
        titulo = m.group(2)
        temas.append({"numero": numero, "titulo": titulo[0].upper() + titulo[1:]})
    return temas


def comprobar_enlaces(urls: list[str], sonda: Callable[[str], int]) -> dict[str, bool]:
    """True si la dirección responde con un estado < 400. Un error de red cuenta como enlace caído."""
    estado: dict[str, bool] = {}
    for url in urls:
        try:
            estado[url] = sonda(url) < 400
        except Exception:  # noqa: BLE001
            estado[url] = False
    return estado
