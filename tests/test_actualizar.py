from datetime import date

from oposiciones.actualizar import actualizar_convocatorias
from oposiciones.boe_client import BoeClient

BASE = "https://www.boe.es/datosabiertos/api"


def _cliente(abrir_falso, cargar_bytes):
    xml = (
        b"<documento><texto><p>El primer ejercicio de la fase de oposici\xc3\xb3n se celebrar\xc3\xa1 "
        b"el d\xc3\xada 14 de marzo de 2027, a las 10:00 horas.</p></texto></documento>"
    )
    return BoeClient(
        abrir_falso(
            {
                f"{BASE}/boe/sumario/20261113": (200, cargar_bytes("sumario_20261113.json")),
                "https://www.boe.es/diario_boe/xml.php?id=BOE-A-2026-20002": (200, xml),
            }
        )
    )


def test_descarga_los_dias_indicados_y_salta_los_que_no_hay_boe(abrir_falso, cargar_bytes):
    # 12 (jueves, sin datos en el falso → 404) y 13 (viernes, con datos)
    res = actualizar_convocatorias(_cliente(abrir_falso, cargar_bytes), hoy=date(2026, 11, 13), dias=2, existentes=[])
    assert len(res) == 5


def test_anade_la_fecha_de_examen_a_los_anuncios_de_admitidos(abrir_falso, cargar_bytes):
    res = actualizar_convocatorias(_cliente(abrir_falso, cargar_bytes), hoy=date(2026, 11, 13), dias=1, existentes=[])
    admitidos = next(c for c in res if c["id"] == "BOE-A-2026-20002")
    assert admitidos["fecha_examen"] == "2027-03-14"
    convocatoria = next(c for c in res if c["id"] == "BOE-A-2026-20001")
    assert convocatoria["fecha_examen"] is None


def test_no_duplica_lo_ya_guardado_y_ordena_por_fecha_descendente(abrir_falso, cargar_bytes):
    previo = [{"id": "BOE-A-2026-20001", "fecha": "2026-11-13", "titulo": "viejo", "fecha_examen": None}]
    previo.append({"id": "BOE-A-2026-00001", "fecha": "2026-10-01", "titulo": "otro", "fecha_examen": None})
    res = actualizar_convocatorias(_cliente(abrir_falso, cargar_bytes), hoy=date(2026, 11, 13), dias=1, existentes=previo)
    ids = [c["id"] for c in res]
    assert ids.count("BOE-A-2026-20001") == 1
    assert ids[-1] == "BOE-A-2026-00001"
    assert next(c for c in res if c["id"] == "BOE-A-2026-20001")["titulo"].startswith("Resolución de 10")


def test_descarta_lo_mas_antiguo_que_la_ventana_de_conservacion(abrir_falso, cargar_bytes):
    muy_viejo = [{"id": "X", "fecha": "2024-01-01", "titulo": "x", "fecha_examen": None}]
    res = actualizar_convocatorias(
        _cliente(abrir_falso, cargar_bytes), hoy=date(2026, 11, 13), dias=1, existentes=muy_viejo, conservar_dias=400
    )
    assert "X" not in [c["id"] for c in res]


def test_eventos_de_examen_junta_boe_y_aportaciones_ordenados():
    from oposiciones.actualizar import eventos_de_examen

    boe = [
        {"id": "A", "fecha_examen": "2027-03-14", "titulo": "t1", "url_html": "u1"},
        {"id": "B", "fecha_examen": None, "titulo": "sin fecha", "url_html": "u2"},
    ]
    manuales = [{"fecha": "2027-01-30", "titulo": "Justicia", "url": "https://ejemplo.es"}]
    res = eventos_de_examen(boe, manuales)
    assert [e["fecha"] for e in res] == ["2027-01-30", "2027-03-14"]
    assert all(e["id"] != "B" for e in res)
