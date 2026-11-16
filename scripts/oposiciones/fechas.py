"""Busca en el texto de un anuncio del BOE la fecha en que se celebra un ejercicio."""

from __future__ import annotations

import re
from datetime import date

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
    "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
FECHA = re.compile(r"(\d{1,2})\s+de\s+(" + "|".join(MESES) + r")\s+de\s+(\d{4})", re.IGNORECASE)
VERBO_EXAMEN = re.compile(r"se celebrar[áa]|tendr[áa] lugar|comenzar[áa]|se realizar[áa]|se llevar[áa]", re.IGNORECASE)


def fecha_de_examen(texto: str) -> str | None:
    """Primera fecha (AAAA-MM-DD) de una frase que habla de un ejercicio y de su celebración."""
    for frase in re.split(r"(?<=[.;])\s+", texto or ""):
        if "ejercicio" not in frase.lower() or not VERBO_EXAMEN.search(frase):
            continue
        for m in FECHA.finditer(frase):
            try:
                return date(int(m.group(3)), MESES[m.group(2).lower()], int(m.group(1))).isoformat()
            except ValueError:
                continue
    return None
