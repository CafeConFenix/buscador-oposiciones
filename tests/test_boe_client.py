import pytest

from oposiciones.boe_client import BoeClient, ErrorBoe

BASE = "https://www.boe.es/datosabiertos/api"


def test_sumario_pide_la_fecha_sin_guiones_y_devuelve_json(cargar_bytes, abrir_falso):
    abrir = abrir_falso({f"{BASE}/boe/sumario/20261113": (200, cargar_bytes("sumario_20261113.json"))})
    datos = BoeClient(abrir).sumario("2026-11-13")
    assert datos["data"]["sumario"]["metadatos"]["fecha_publicacion"] == "20261113"
    assert abrir.llamadas == [(f"{BASE}/boe/sumario/20261113", "application/json")]


def test_sumario_de_un_dia_sin_boe_devuelve_none(abrir_falso):
    # Los domingos no hay BOE: la API responde 404
    assert BoeClient(abrir_falso({})).sumario("2026-11-15") is None


def test_otros_errores_lanzan_excepcion(abrir_falso):
    abrir = abrir_falso({f"{BASE}/boe/sumario/20261113": (500, b"")})
    with pytest.raises(ErrorBoe):
        BoeClient(abrir).sumario("2026-11-13")


def test_indice_devuelve_lista_de_bloques(cargar_bytes, abrir_falso):
    url = f"{BASE}/legislacion-consolidada/id/BOE-A-1978-31229/texto/indice"
    bloques = BoeClient(abrir_falso({url: (200, cargar_bytes("indice_norma.json"))})).indice("BOE-A-1978-31229")
    assert [b["id"] for b in bloques] == ["no", "pr", "a1", "a14", "a135", "fi"]


def test_bloque_usa_la_ultima_version_vigente(cargar_bytes, abrir_falso):
    url = f"{BASE}/legislacion-consolidada/id/BOE-A-1978-31229/texto/bloque/a135"
    bloque = BoeClient(abrir_falso({url: (200, cargar_bytes("bloque_a135.xml"))})).bloque("BOE-A-1978-31229", "a135")
    assert bloque.id == "a135"
    assert bloque.tipo == "precepto"
    assert bloque.titulo == "Artículo 135"
    assert bloque.parrafos[0] == "Artículo 135."
    assert "estabilidad presupuestaria" in bloque.parrafos[1]
    assert not any("antiguo" in p for p in bloque.parrafos)


def test_metadatos_extrae_el_titulo(abrir_falso):
    url = f"{BASE}/legislacion-consolidada/id/BOE-A-2015-10565/metadatos"
    cuerpo = b'{"status":{"code":"200"},"data":{"metadatos":{"titulo":"Ley 39/2015, de 1 de octubre."}}}'
    assert BoeClient(abrir_falso({url: (200, cuerpo)})).titulo_norma("BOE-A-2015-10565") == "Ley 39/2015, de 1 de octubre."


def test_indice_acepta_data_como_lista_de_bloques(cargar_bytes, abrir_falso):
    # La API real devuelve en JSON "data" como lista (sin el nodo "bloque").
    url = f"{BASE}/legislacion-consolidada/id/BOE-A-1978-31229/texto/indice"
    bloques = BoeClient(abrir_falso({url: (200, cargar_bytes("indice_lista.json"))})).indice("BOE-A-1978-31229")
    assert [b["id"] for b in bloques] == ["no", "a14", "a135"]
    assert bloques[2]["fecha_actualizacion"] == "20110927"


def test_indice_acepta_elementos_envueltos_en_bloque(cargar_bytes, abrir_falso):
    url = f"{BASE}/legislacion-consolidada/id/BOE-A-1978-31229/texto/indice"
    bloques = BoeClient(abrir_falso({url: (200, cargar_bytes("indice_lista_envuelta.json"))})).indice("BOE-A-1978-31229")
    assert [b["id"] for b in bloques] == ["a14", "a135"]


def test_indice_vacio_devuelve_lista_vacia(abrir_falso):
    url = f"{BASE}/legislacion-consolidada/id/X/texto/indice"
    assert BoeClient(abrir_falso({url: (200, b'{"status":{"code":"200"},"data":[]}')})).indice("X") == []


def test_texto_completo_devuelve_todos_los_bloques_con_su_version_vigente(cargar_bytes, abrir_falso):
    url = f"{BASE}/legislacion-consolidada/id/BOE-A-1978-31229/texto"
    bloques = BoeClient(abrir_falso({url: (200, cargar_bytes("texto_completo.xml"))})).texto_completo("BOE-A-1978-31229")
    assert [b.id for b in bloques] == ["no", "ti", "a14", "a135", "da1", "fi"]
    a135 = next(b for b in bloques if b.id == "a135")
    assert "Estabilidad" in a135.parrafos[1] and not any("antiguo" in p for p in a135.parrafos)
    assert next(b for b in bloques if b.id == "fi").tipo == "firma"
