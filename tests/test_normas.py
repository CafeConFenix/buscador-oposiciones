from oposiciones.boe_client import BoeClient
from oposiciones.normas import construir_norma, comprobar_titulo, necesita_actualizar

BASE = "https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/BOE-A-1978-31229"


def _cliente(abrir_falso, cargar_bytes):
    return BoeClient(
        abrir_falso(
            {
                f"{BASE}/metadatos": (200, b'{"data":{"metadatos":{"titulo":"Constituci\\u00f3n Espa\\u00f1ola."}}}'),
                f"{BASE}/texto/indice": (200, cargar_bytes("indice_norma.json")),
                f"{BASE}/texto/bloque/a14": (200, cargar_bytes("bloque_a14.xml")),
                f"{BASE}/texto/bloque/a135": (200, cargar_bytes("bloque_a135.xml")),
            }
        )
    )


def test_construye_la_norma_solo_con_articulos(abrir_falso, cargar_bytes):
    # En el índice hay bloques que no se descargan (nota inicial, firma) o que aquí no existen
    # (preámbulo, artículo 1): la norma se arma con los que sí devuelven contenido de tipo precepto.
    norma = construir_norma(_cliente(abrir_falso, cargar_bytes), "BOE-A-1978-31229")
    assert norma["id"] == "BOE-A-1978-31229"
    assert norma["titulo"] == "Constitución Española."
    assert [a["id"] for a in norma["articulos"]] == ["a14", "a135"]
    assert norma["articulos"][0]["parrafos"][1].startswith("Los españoles son iguales ante la ley")


def test_la_huella_es_la_fecha_de_actualizacion_mas_reciente(abrir_falso, cargar_bytes):
    norma = construir_norma(_cliente(abrir_falso, cargar_bytes), "BOE-A-1978-31229")
    assert norma["huella"] == "20110927"


def test_no_vuelve_a_descargar_si_la_huella_no_cambia():
    indice = [{"fecha_actualizacion": "20110927"}, {"fecha_actualizacion": "19781229"}]
    assert necesita_actualizar({"huella": "20110927"}, indice) is False
    assert necesita_actualizar({"huella": "20100101"}, indice) is True
    assert necesita_actualizar(None, indice) is True


def test_avisa_si_el_id_no_corresponde_a_la_norma_esperada():
    assert comprobar_titulo("Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común.", "39/2015") is True
    assert comprobar_titulo("Ley 40/2015, de 1 de octubre.", "39/2015") is False


def test_usa_el_texto_completo_en_una_sola_peticion_y_descarta_firma_notas_y_encabezados(abrir_falso, cargar_bytes):
    cliente = BoeClient(
        abrir_falso(
            {
                f"{BASE}/metadatos": (200, b'{"data":[{"titulo":"Constituci\\u00f3n Espa\\u00f1ola."}]}'),
                f"{BASE}/texto/indice": (200, cargar_bytes("indice_lista.json")),
                f"{BASE}/texto": (200, cargar_bytes("texto_completo.xml")),
            }
        )
    )
    norma = construir_norma(cliente, "BOE-A-1978-31229")
    assert [a["id"] for a in norma["articulos"]] == ["a14", "a135", "da1"]
    assert norma["titulo"] == "Constitución Española."
    assert norma["huella"] == "20110927"
    # no se pidió ningún bloque suelto
    assert not any("/texto/bloque/" in u for u, _ in cliente._abrir.llamadas)
