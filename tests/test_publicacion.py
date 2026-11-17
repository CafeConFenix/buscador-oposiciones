import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from oposiciones.publicacion import generar_rss, pagina_oposicion, generar_sitemap

BASE = "https://usuario.github.io/web/"
AHORA = datetime(2026, 11, 17, 9, 0, tzinfo=timezone.utc)

CONVS = [
    {"id": "A", "fecha": "2026-11-16", "titulo": "Se convocan plazas de Auxiliar & más", "tipo": "convocatoria",
     "organismo": "Ministerio", "url_html": "https://www.boe.es/a"},
    {"id": "B", "fecha": "2026-11-15", "titulo": "Concurso de traslados", "tipo": "concurso", "organismo": "X", "url_html": "u"},
    {"id": "C", "fecha": "2026-11-14", "titulo": "Admitidos y excluidos", "tipo": "admitidos", "organismo": "Y", "url_html": "https://www.boe.es/c"},
]
OPO = {"id": "aux", "nombre": "Cuerpo <General> Auxiliar", "area": "Administración General del Estado", "grupo": "C2",
       "normas": ["constitucion"], "enlaces": [{"titulo": "BOE", "url": "https://www.boe.es"}]}


def test_el_rss_solo_incluye_convocatorias_y_admitidos_y_es_xml_valido():
    xml = generar_rss(CONVS, BASE, AHORA)
    raiz = ET.fromstring(xml)
    titulos = [i.findtext("title") for i in raiz.iter("item")]
    assert titulos == ["Se convocan plazas de Auxiliar & más", "Admitidos y excluidos"]
    assert raiz.find("channel/link").text == BASE


def test_el_rss_usa_fechas_rfc822_y_enlaces_oficiales():
    raiz = ET.fromstring(generar_rss(CONVS, BASE, AHORA))
    primero = next(raiz.iter("item"))
    assert primero.findtext("link") == "https://www.boe.es/a"
    assert primero.findtext("pubDate").startswith("Mon, 16 Nov 2026")


def test_la_pagina_de_una_oposicion_es_indexable_y_escapa_el_texto():
    html = pagina_oposicion(OPO, BASE)
    assert "<title>Cuerpo &lt;General&gt; Auxiliar" in html
    assert f'<link rel="canonical" href="{BASE}oposicion/aux/">' in html
    assert 'name="description"' in html
    assert "../../#/oposicion/aux" in html
    assert "<General>" not in html


def test_el_sitemap_lista_la_portada_y_cada_oposicion():
    xml = generar_sitemap([OPO, {**OPO, "id": "otra"}], BASE)
    urls = [u.text for u in ET.fromstring(xml).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert urls == [BASE, f"{BASE}oposicion/aux/", f"{BASE}oposicion/otra/"]


def test_se_registra_cuando_una_norma_cambia(tmp_path, abrir_falso, cargar_bytes):
    from oposiciones.actualizar import actualizar_normas
    from oposiciones.boe_client import BoeClient

    base = "https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/BOE-A-1978-31229"
    cliente = BoeClient(abrir_falso({
        f"{base}/metadatos": (200, b'{"data":[{"titulo":"Constituci\\u00f3n Espa\\u00f1ola."}]}'),
        f"{base}/texto/indice": (200, cargar_bytes("indice_lista.json")),
        f"{base}/texto": (200, cargar_bytes("texto_completo.xml")),
    }))
    (tmp_path / "BOE-A-1978-31229.json").write_text(json.dumps({"huella": "19000101", "titulo": "x", "articulos": []}), "utf-8")
    cambios: list = []
    normas = [{"slug": "constitucion", "nombre": "Constitución", "id": "BOE-A-1978-31229", "referencia": "Constitución"}]
    actualizar_normas(cliente, normas, tmp_path, cambios=cambios)
    assert len(cambios) == 1
    assert cambios[0]["norma"] == "Constitución" and cambios[0]["anterior"] == "19000101" and cambios[0]["fecha"]
