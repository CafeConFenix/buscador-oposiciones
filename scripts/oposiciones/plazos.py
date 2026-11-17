"""Plazo de solicitudes y tasa de examen, leídos del texto de una convocatoria del BOE."""

from __future__ import annotations

import calendar
import re
from datetime import date, timedelta

NUMEROS = {
    "un": 1, "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9,
    "diez": 10, "quince": 15, "veinte": 20, "veinticinco": 25, "treinta": 30,
}
_PLAZO_DIAS = re.compile(
    r"plazo[^.]{0,220}?\b(\d{1,2}|[a-záéíóú]+)\s*(?:\(\d+\)\s*)?d[ií]as\s+(h[aá]biles|naturales)", re.IGNORECASE
)
_PLAZO_MES = re.compile(r"plazo[^.]{0,220}?\bun\s+mes\b", re.IGNORECASE)
_TASA = re.compile(r"(?:tasas?|derechos\s+de\s+examen)[^;]{0,200}?(\d{1,3}(?:\.\d{3})*,\d{2})\s*euros", re.IGNORECASE)


def extraer_plazo(texto: str) -> tuple[int, str] | None:
    """(cantidad, 'hábiles' | 'naturales' | 'mes') o None si el texto no fija plazo."""
    for m in _PLAZO_DIAS.finditer(texto):
        palabra = m.group(1).lower()
        cantidad = int(palabra) if palabra.isdigit() else NUMEROS.get(palabra)
        if cantidad:
            return cantidad, "hábiles" if m.group(2).lower().startswith("h") else "naturales"
    if _PLAZO_MES.search(texto):
        return 1, "mes"
    return None


def extraer_tasa(texto: str) -> float | None:
    m = _TASA.search(texto)
    return float(m.group(1).replace(".", "").replace(",", ".")) if m else None


def fin_de_plazo(publicacion: str, cantidad: int, unidad: str) -> str:
    """Último día del plazo. Se cuenta desde el día siguiente; los hábiles excluyen sábados y domingos
    (los festivos no se descuentan, así que es una fecha orientativa)."""
    inicio = date.fromisoformat(publicacion)
    if unidad == "naturales":
        return (inicio + timedelta(days=cantidad)).isoformat()
    if unidad == "mes":
        mes = inicio.month % 12 + 1
        anio = inicio.year + (inicio.month == 12)
        return date(anio, mes, min(inicio.day, calendar.monthrange(anio, mes)[1])).isoformat()
    dia, contados = inicio, 0
    while contados < cantidad:
        dia += timedelta(days=1)
        if dia.weekday() < 5:
            contados += 1
    return dia.isoformat()
