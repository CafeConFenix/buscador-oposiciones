import json
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


def test_un_error_inesperado_en_una_norma_no_impide_actualizar_las_demas(tmp_path, abrir_falso, cargar_bytes, capsys):
    from oposiciones.actualizar import actualizar_normas

    base = "https://www.boe.es/datosabiertos/api/legislacion-consolidada/id"
    cliente = BoeClient(
        abrir_falso(
            {
                # primera norma: el índice llega con un cuerpo que no es JSON
                f"{base}/ROTA/texto/indice": (200, b"<html>mantenimiento</html>"),
                f"{base}/BOE-A-1978-31229/metadatos": (200, b'{"data":[{"titulo":"Constituci\\u00f3n Espa\\u00f1ola."}]}'),
                f"{base}/BOE-A-1978-31229/texto/indice": (200, cargar_bytes("indice_lista.json")),
                f"{base}/BOE-A-1978-31229/texto": (200, cargar_bytes("texto_completo.xml")),
            }
        )
    )
    normas = [
        {"slug": "rota", "nombre": "Rota", "id": "ROTA", "referencia": "x"},
        {"slug": "constitucion", "nombre": "Constitución", "id": "BOE-A-1978-31229", "referencia": "Constitución"},
    ]
    resumen = actualizar_normas(cliente, normas, tmp_path)
    assert (tmp_path / "BOE-A-1978-31229.json").exists()
    assert not (tmp_path / "ROTA.json").exists()
    assert resumen == {"actualizadas": 1, "sin_cambios": 0, "con_error": 1}
    assert "Rota" in capsys.readouterr().err


def test_las_convocatorias_guardan_plazo_fin_de_plazo_y_tasa(abrir_falso, cargar_json):
    sumario = cargar_json("sumario_20261113.json")

    def poner_xml(o):
        if isinstance(o, dict):
            if o.get("identificador") == "BOE-A-2026-20001":
                o["url_xml"] = "https://www.boe.es/diario_boe/xml.php?id=BOE-A-2026-20001"
            for v in o.values():
                poner_xml(v)
        elif isinstance(o, list):
            for v in o:
                poner_xml(v)

    poner_xml(sumario)
    texto = (
        "<documento><texto><p>El plazo de presentación de solicitudes será de veinte días hábiles, contados desde "
        "el siguiente a la publicación.</p><p>La tasa por derechos de examen será de 12,38 euros.</p></texto></documento>"
    ).encode()
    cliente = BoeClient(abrir_falso({
        f"{BASE}/boe/sumario/20261113": (200, json.dumps(sumario).encode()),
        "https://www.boe.es/diario_boe/xml.php?id=BOE-A-2026-20001": (200, texto),
    }))
    res = actualizar_convocatorias(cliente, hoy=date(2026, 11, 13), dias=1, existentes=[])
    conv = next(c for c in res if c["id"] == "BOE-A-2026-20001")
    assert conv["plazo"] == "20 días hábiles"
    assert conv["fin_plazo"] == "2026-12-11"  # publicada el viernes 13-11
    assert conv["tasa"] == 12.38


def test_las_convocatorias_no_se_pierden_aunque_el_sumario_no_traiga_fecha(cargar_json):
    """Causa raíz del calendario vacío: sin fecha, el filtro de antigüedad descartaba todo."""
    from datetime import date
    from oposiciones.actualizar import actualizar_convocatorias
    from oposiciones.boe_client import BoeClient
    import json

    sumario = cargar_json("sumario_20261119_real.json")
    sumario["data"]["sumario"]["metadatos"] = {"publicacion": "BOE"}

    def abrir(url, accept):
        if url.endswith("/20261119"):
            return 200, json.dumps(sumario).encode()
        if "sumario" in url:
            return 404, b""
        return 200, b"<documento><texto><p>Sin datos</p></texto></documento>"

    resultado = actualizar_convocatorias(BoeClient(abrir), date(2026, 11, 19), 3, [])
    assert {c["id"] for c in resultado} >= {"BOE-A-2026-24215", "BOE-A-2026-24217", "BOE-A-2026-24223"}
    assert all(c["fecha"] == "2026-11-19" for c in resultado)


def _abrir_con(sumarios: dict, error_en=()):
    import json

    def abrir(url, accept):
        for fin, cuerpo in sumarios.items():
            if url.endswith("/" + fin):
                return 200, cuerpo if isinstance(cuerpo, bytes) else json.dumps(cuerpo).encode()
        for fin in error_en:
            if url.endswith("/" + fin):
                return 500, b"error"
        if "/sumario/" in url:
            return 404, b""
        return 200, b"<documento><texto><p>x</p></texto></documento>"

    return abrir


def test_un_dia_con_error_no_impide_los_demas_ni_borra_lo_guardado(cargar_json):
    from datetime import date
    from oposiciones.actualizar import actualizar_convocatorias
    from oposiciones.boe_client import BoeClient

    previo = {"id": "BOE-A-2026-1", "fecha": "2026-11-10", "titulo": "antigua", "organismo": "X", "tipo": "otros", "fecha_examen": None}
    abrir = _abrir_con({"20261119": cargar_json("sumario_20261119_real.json")}, error_en=("20261118",))
    res = actualizar_convocatorias(BoeClient(abrir), date(2026, 11, 19), 3, [previo])
    ids = {c["id"] for c in res}
    assert "BOE-A-2026-1" in ids and "BOE-A-2026-24217" in ids


def test_si_todos_los_dias_fallan_el_proceso_falla_de_forma_visible():
    import pytest
    from datetime import date
    from oposiciones.actualizar import actualizar_convocatorias
    from oposiciones.boe_client import BoeClient, ErrorBoe

    abrir = _abrir_con({}, error_en=("20261119", "20261118", "20261117"))
    with pytest.raises(ErrorBoe, match="ningún sumario"):
        actualizar_convocatorias(BoeClient(abrir), date(2026, 11, 19), 3, [])


def test_si_el_boe_responde_pero_no_se_extrae_nada_varios_dias_laborables_falla():
    import pytest
    from datetime import date
    from oposiciones.actualizar import actualizar_convocatorias
    from oposiciones.boe_client import BoeClient, ErrorBoe

    vacio = {"status": {"code": "200"}, "data": {"sumario": {"metadatos": {"fecha_publicacion": "x"}, "diario": [{"seccion": [{"codigo": "1", "nombre": "I", "departamento": []}]}]}}}
    abrir = _abrir_con({"20261119": vacio, "20261118": vacio, "20261117": vacio})  # jueves, miércoles, martes
    with pytest.raises(ErrorBoe, match="cero convocatorias"):
        actualizar_convocatorias(BoeClient(abrir), date(2026, 11, 19), 3, [])


def test_un_fin_de_semana_sin_boe_o_sin_convocatorias_no_cuenta_como_fallo():
    from datetime import date
    from oposiciones.actualizar import actualizar_convocatorias
    from oposiciones.boe_client import BoeClient

    assert actualizar_convocatorias(BoeClient(_abrir_con({})), date(2026, 11, 22), 3, []) == []  # todo 404
