from oposiciones.convocatorias import extraer_convocatorias, clasificar_titulo


def test_solo_se_extrae_la_seccion_2b(cargar_json):
    items = extraer_convocatorias(cargar_json("sumario_20261113.json"))
    ids = {c.id for c in items}
    assert "BOE-A-2026-99001" not in ids  # sección I: no es oposición
    assert ids == {
        "BOE-A-2026-20001",
        "BOE-A-2026-20002",
        "BOE-A-2026-20003",
        "BOE-A-2026-20004",
        "BOE-A-2026-20005",
    }


def test_acepta_item_como_objeto_como_lista_y_colgando_del_departamento(cargar_json):
    items = extraer_convocatorias(cargar_json("sumario_20261113.json"))
    organismos = {c.id: c.organismo for c in items}
    assert organismos["BOE-A-2026-20001"].startswith("MINISTERIO PARA LA TRANSFORMACIÓN")  # item objeto
    assert organismos["BOE-A-2026-20002"].startswith("MINISTERIO PARA LA TRANSFORMACIÓN")  # item en lista
    assert organismos["BOE-A-2026-20005"] == "MINISTERIO DEL INTERIOR"  # item sin epígrafe


def test_la_fecha_es_la_de_publicacion_en_formato_iso(cargar_json):
    items = extraer_convocatorias(cargar_json("sumario_20261113.json"))
    assert {c.fecha for c in items} == {"2026-11-13"}


def test_guarda_enlaces_oficiales(cargar_json):
    c = next(c for c in extraer_convocatorias(cargar_json("sumario_20261113.json")) if c.id == "BOE-A-2026-20001")
    assert c.url_html == "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20001"
    assert c.url_pdf.endswith("BOE-A-2026-20001.pdf")


def test_clasifica_cada_tipo_de_anuncio(cargar_json):
    tipos = {c.id: c.tipo for c in extraer_convocatorias(cargar_json("sumario_20261113.json"))}
    assert tipos["BOE-A-2026-20001"] == "convocatoria"
    assert tipos["BOE-A-2026-20002"] == "admitidos"
    assert tipos["BOE-A-2026-20003"] == "concurso"
    assert tipos["BOE-A-2026-20004"] == "correccion"
    assert tipos["BOE-A-2026-20005"] == "resultado"


def test_una_correccion_de_una_convocatoria_no_es_una_convocatoria():
    assert clasificar_titulo("Corrección de errores de la Resolución ..., por la que se convoca proceso selectivo") == "correccion"


def test_titulo_desconocido_es_otros():
    assert clasificar_titulo("Resolución por la que se nombran funcionarios de carrera") == "otros"


def test_sumario_vacio_no_da_resultados():
    assert extraer_convocatorias({"status": {"code": "404"}, "data": {}}) == []
    assert extraer_convocatorias(None) == []


def test_reconoce_la_seccion_por_su_nombre_aunque_cambie_el_codigo():
    sumario = {
        "data": {
            "sumario": {
                "metadatos": {"fecha_publicacion": "20261113"},
                "diario": [
                    {
                        "seccion": {
                            "codigo": "II.B",
                            "nombre": "II. Autoridades y personal - B. Oposiciones y concursos",
                            "departamento": {
                                "nombre": "MINISTERIO X",
                                "item": {"identificador": "BOE-A-2026-1", "titulo": "Resolución por la que se convoca proceso selectivo."},
                            },
                        }
                    }
                ],
            }
        }
    }
    assert [c.id for c in extraer_convocatorias(sumario)] == ["BOE-A-2026-1"]


def test_sumario_real_con_fecha_en_metadatos_fecha(cargar_json):
    """La documentación oficial da la fecha como `fecha` y como `fecha_publicacion`: se aceptan las dos."""
    items = extraer_convocatorias(cargar_json("sumario_20261119_real.json"))
    assert {c.id for c in items} == {"BOE-A-2026-24215", "BOE-A-2026-24217", "BOE-A-2026-24223"}
    assert {c.fecha for c in items} == {"2026-11-19"}


def test_si_el_sumario_no_trae_fecha_se_usa_la_del_dia_pedido(cargar_json):
    sumario = cargar_json("sumario_20261119_real.json")
    sumario["data"]["sumario"]["metadatos"] = {"publicacion": "BOE"}
    items = extraer_convocatorias(sumario, fecha="2026-11-19")
    assert items and {c.fecha for c in items} == {"2026-11-19"}


def test_titulos_reales_se_clasifican_bien():
    corregir = "Resolución de 12 de noviembre de 2026, de la Subsecretaría, por la que se corrigen errores en la de 19 de octubre de 2026, por la que se convoca concurso para la provisión de puestos de trabajo en el Organismo Estatal Inspección de Trabajo y Seguridad Social."
    assert clasificar_titulo(corregir) == "correccion"
    local = "Resolución de 5 de noviembre de 2026, del Ayuntamiento de Burgos, referente a la convocatoria para proveer varias plazas."
    assert clasificar_titulo(local) == "convocatoria"
    admitidos = "Resolución de 30 de octubre de 2026, de la Presidencia de la Agencia Estatal de Administración Tributaria, por la que se aprueba la relación provisional de personas admitidas y excluidas y se anuncia fecha, hora y lugar de celebración del ejercicio único del proceso selectivo"
    assert clasificar_titulo(admitidos) == "admitidos"
