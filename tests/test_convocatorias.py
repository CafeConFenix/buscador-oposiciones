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
