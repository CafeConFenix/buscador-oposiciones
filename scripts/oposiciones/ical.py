"""Genera un calendario iCalendar (.ics) al que cualquiera puede suscribirse desde Google Calendar, Apple o Outlook."""

from __future__ import annotations

from datetime import date

CRLF = "\r\n"


def generar_ics(eventos: list[dict], hoy: date) -> str:
    """eventos: dicts con id, fecha (AAAA-MM-DD), titulo y url. Cada uno es un evento de día completo."""
    lineas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//oposiciones-es//Calendario de examenes//ES",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Exámenes de oposiciones",
        "X-WR-TIMEZONE:Europe/Madrid",
    ]
    sello = hoy.strftime("%Y%m%d") + "T000000Z"
    for e in eventos:
        lineas += [
            "BEGIN:VEVENT",
            f"UID:{e['id']}@oposiciones-es",
            f"DTSTAMP:{sello}",
            f"DTSTART;VALUE=DATE:{e['fecha'].replace('-', '')}",
            "SUMMARY:" + _escapar("Examen: " + e["titulo"]),
        ]
        if e.get("url"):
            lineas.append("URL:" + e["url"])
            lineas.append("DESCRIPTION:" + _escapar("Anuncio oficial: " + e["url"]))
        lineas.append("END:VEVENT")
    lineas.append("END:VCALENDAR")
    return CRLF.join(_plegar(linea) for linea in lineas) + CRLF


def _escapar(texto: str) -> str:
    return texto.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _plegar(linea: str, limite: int = 75) -> str:
    """Divide una línea larga en trozos de hasta 75 octetos sin partir caracteres UTF-8."""
    trozos, actual, octetos = [], "", 0
    for caracter in linea:
        largo = len(caracter.encode("utf-8"))
        tope = limite if not trozos else limite - 1  # la continuación empieza con un espacio
        if octetos + largo > tope:
            trozos.append(actual)
            actual, octetos = "", 0
        actual += caracter
        octetos += largo
    trozos.append(actual)
    return (CRLF + " ").join(trozos)
