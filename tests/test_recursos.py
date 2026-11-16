import json
from pathlib import Path

RECURSOS = Path(__file__).resolve().parents[1] / "site" / "data" / "recursos.json"


def _cargar():
    return json.loads(RECURSOS.read_text("utf-8"))


def _urls(datos):
    for c in datos["comunidades"]:
        yield c["boletin"]["url"]
        yield c["empleo"]
        yield c["sanidad"]["url"]
        yield c["educacion"]
    for seccion in ("estado", "academias"):
        for r in datos[seccion]:
            yield r["url"]


def test_estan_las_17_comunidades_y_las_2_ciudades_autonomas():
    assert len(_cargar()["comunidades"]) == 19


def test_cada_comunidad_tiene_boletin_empleo_sanidad_y_educacion():
    for c in _cargar()["comunidades"]:
        assert c["nombre"] and c["boletin"]["nombre"] and c["sanidad"]["nombre"], c["id"]


def test_los_identificadores_son_unicos():
    ids = [c["id"] for c in _cargar()["comunidades"]]
    assert len(ids) == len(set(ids))


def test_todas_las_direcciones_son_https():
    assert all(u.startswith("https://") for u in _urls(_cargar()))
