from datetime import date

from oposiciones.ical import generar_ics

EVENTOS = [
    {"id": "BOE-A-2026-20002", "fecha": "2027-03-14", "titulo": "Admitidos, auxiliar; primer ejercicio", "url": "https://www.boe.es/x"},
]


def test_genera_un_evento_de_dia_completo():
    ics = generar_ics(EVENTOS, hoy=date(2026, 11, 16))
    assert ics.startswith("BEGIN:VCALENDAR\r\n")
    assert ics.rstrip().endswith("END:VCALENDAR")
    assert "DTSTART;VALUE=DATE:20270314" in ics
    assert "UID:BOE-A-2026-20002@oposiciones-es" in ics
    assert "DTSTAMP:20261116T000000Z" in ics


def test_escapa_comas_y_puntos_y_comas():
    ics = generar_ics(EVENTOS, hoy=date(2026, 11, 16))
    assert "SUMMARY:Examen: Admitidos\\, auxiliar\; primer ejercicio" in ics


def test_las_lineas_no_pasan_de_75_octetos_y_usan_crlf():
    largo = [{"id": "X", "fecha": "2027-01-01", "titulo": "ñ" * 120, "url": "https://www.boe.es/" + "a" * 120}]
    ics = generar_ics(largo, hoy=date(2026, 11, 16))
    assert "\n" not in ics.replace("\r\n", "")
    for linea in ics.split("\r\n"):
        assert len(linea.encode("utf-8")) <= 75


def test_sin_eventos_sigue_siendo_un_calendario_valido():
    ics = generar_ics([], hoy=date(2026, 11, 16))
    assert "BEGIN:VCALENDAR" in ics and "END:VCALENDAR" in ics and "BEGIN:VEVENT" not in ics
