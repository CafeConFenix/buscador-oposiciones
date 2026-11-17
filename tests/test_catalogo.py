import json
from pathlib import Path

DATOS = Path(__file__).resolve().parents[1] / "site" / "data"


def _cargar(nombre):
    return json.loads((DATOS / nombre).read_text("utf-8"))


def test_el_catalogo_tiene_al_menos_140_oposiciones():
    assert len(_cargar("oposiciones.json")) >= 140


def test_los_identificadores_son_unicos_y_sin_espacios():
    ids = [o["id"] for o in _cargar("oposiciones.json")]
    assert len(ids) == len(set(ids))
    assert all(i == i.lower() and " " not in i for i in ids)


def test_toda_oposicion_apunta_a_normas_que_existen():
    slugs = {n["slug"] for n in _cargar("normas.json")}
    for o in _cargar("oposiciones.json"):
        assert set(o["normas"]) <= slugs, o["id"]


def test_toda_oposicion_tiene_los_campos_que_necesita_la_web():
    for o in _cargar("oposiciones.json"):
        assert o["nombre"] and o["area"] and o["ambito"] in {"Estado", "Autonómica", "Local"}, o["id"]
        assert o["enlaces"] and all(e["url"].startswith("https://") for e in o["enlaces"]), o["id"]


def test_las_oposiciones_con_recursos_los_tienen_bien_formados():
    con_recursos = [o for o in _cargar("oposiciones.json") if o["recursos"]]
    assert len(con_recursos) >= 40
    for o in con_recursos:
        for r in o["recursos"]:
            assert r["titulo"] and r["url"].startswith("https://") and r["tipo"] and r["fuente"], o["id"]
        urls = [r["url"] for r in o["recursos"]]
        assert len(urls) == len(set(urls)), o["id"]
