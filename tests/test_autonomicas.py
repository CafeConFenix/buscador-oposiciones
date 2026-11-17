import json
from datetime import date

from oposiciones.autonomicas import actualizar_autonomicas, descubrir_feeds, es_de_oposiciones, leer_feed

RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>Boletín</title>
<item><title>Resolución por la que se convocan pruebas selectivas para Auxiliar Administrativo</title>
<link>https://b.es/1</link><pubDate>Mon, 16 Nov 2026 08:00:00 +0000</pubDate></item>
<item><title>Subvenciones a asociaciones culturales</title><link>https://b.es/2</link><pubDate>Mon, 16 Nov 2026 08:00:00 +0000</pubDate></item>
</channel></rss>""".encode()

ATOM = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title>
<entry><title>Bolsa de empleo temporal de enfermería</title><link href="https://b.es/3"/><updated>2026-11-15T10:00:00Z</updated></entry>
</feed>""".encode()

HTML = """<html><head>
<link rel="alternate" type="application/rss+xml" href="/rss/oposiciones.xml">
<link type="application/atom+xml" rel="alternate" href="https://otro.es/feed">
</head><body><a href="/servicios/rss">RSS</a><a href="/contacto">Contacto</a></body></html>"""


def test_descubre_los_feeds_anunciados_en_la_pagina():
    feeds = descubrir_feeds(HTML, "https://boletin.es/inicio")
    assert "https://boletin.es/rss/oposiciones.xml" in feeds
    assert "https://otro.es/feed" in feeds
    assert "https://boletin.es/servicios/rss" in feeds
    assert all("contacto" not in f for f in feeds)


def test_lee_rss_y_atom():
    rss = leer_feed(RSS)
    assert [i["titulo"][:10] for i in rss] == ["Resolución", "Subvencion"]
    assert rss[0]["fecha"] == "2026-11-16" and rss[0]["url"] == "https://b.es/1"
    atom = leer_feed(ATOM)
    assert atom[0]["fecha"] == "2026-11-15" and atom[0]["url"] == "https://b.es/3"


def test_un_cuerpo_que_no_es_feed_da_lista_vacia():
    assert leer_feed(b"<html>no soy un feed</html>") == []


def test_filtra_lo_que_son_oposiciones():
    assert es_de_oposiciones("Se convocan pruebas selectivas para Celador")
    assert es_de_oposiciones("Bolsa de empleo temporal de enfermería")
    assert not es_de_oposiciones("Subvenciones a asociaciones culturales")


def test_actualiza_por_comunidad_y_tolera_fallos(tmp_path, abrir_falso):
    comunidades = [
        {"id": "madrid", "nombre": "Comunidad de Madrid", "boletin": {"url": "https://m.es/"}, "empleo": "https://m.es/empleo"},
        {"id": "rota", "nombre": "Galicia", "boletin": {"url": "https://g.es/"}, "empleo": "https://g.es/empleo"},
    ]
    abrir = abrir_falso({
        "https://m.es/": (200, b'<link rel="alternate" type="application/rss+xml" href="https://m.es/rss">'),
        "https://m.es/empleo": (200, b"<html></html>"),
        "https://m.es/rss": (200, RSS),
        "https://g.es/": (500, b"error"),
    })
    destino = tmp_path / "ccaa.json"
    resumen = actualizar_autonomicas(abrir, comunidades, destino, date(2026, 11, 17))
    datos = json.loads(destino.read_text("utf-8"))
    assert len(datos) == 1
    assert datos[0]["organismo"] == "Comunidad de Madrid" and datos[0]["tipo"] == "convocatoria"
    assert datos[0]["fecha"] == "2026-11-16" and datos[0]["url_html"] == "https://b.es/1"
    assert resumen["anuncios"] == 1 and resumen["con_error"] >= 1
    # una segunda pasada no duplica
    actualizar_autonomicas(abrir, comunidades, destino, date(2026, 11, 17))
    assert len(json.loads(destino.read_text("utf-8"))) == 1
