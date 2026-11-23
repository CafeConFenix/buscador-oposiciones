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


def test_feed_que_declara_latin1_pero_sirve_utf8_no_rompe_las_tildes():
    from oposiciones.autonomicas import leer_feed

    cuerpo = (
        '<?xml version="1.0" encoding="ISO-8859-1"?><rss version="2.0"><channel><item>'
        "<title>Resolución de la Dirección General de Función Pública, proceso selectivo</title>"
        "<link>https://doe.juntaex.es/a</link><pubDate>Thu, 19 Nov 2026 10:00:00 +0100</pubDate></item></channel></rss>"
    ).encode("utf-8")
    assert leer_feed(cuerpo)[0]["titulo"] == "Resolución de la Dirección General de Función Pública, proceso selectivo"


def test_feed_realmente_latin1_tambien_se_lee_bien():
    from oposiciones.autonomicas import leer_feed

    cuerpo = (
        '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><item><title>Oposición de Educación</title>'
        "<link>https://x.es/a</link></item></channel></rss>"
    ).encode("latin-1")
    assert leer_feed(cuerpo)[0]["titulo"] == "Oposición de Educación"


def test_se_reparan_los_textos_ya_guardados_con_la_codificacion_rota(tmp_path):
    import json
    from datetime import date
    from oposiciones.autonomicas import actualizar_autonomicas

    destino = tmp_path / "ccaa.json"
    destino.write_text(json.dumps([{"id": "ccaa-1", "fecha": "2026-11-19", "titulo": "ResoluciÃ³n de la DirecciÃ³n General", "organismo": "Extremadura", "tipo": "convocatoria", "url_html": "u", "fecha_examen": None, "fuente": "boletín autonómico"}]), "utf-8")
    actualizar_autonomicas(lambda u, a: (404, b""), [], destino, date(2026, 11, 20))
    assert json.loads(destino.read_text("utf-8"))[0]["titulo"] == "Resolución de la Dirección General"


def test_un_feed_fijo_de_la_seccion_de_oposiciones_se_lee_sin_filtrar_por_palabras(tmp_path):
    import json
    from datetime import date
    from oposiciones.autonomicas import actualizar_autonomicas

    feed = (
        '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>'
        "<title>Resolución de 10 de noviembre de 2026, de la Dirección General de Recursos Humanos, por la que se anuncia la lista definitiva</title>"
        '<link href="https://www.juntadeandalucia.es/boja/2026/1/2"/><updated>2026-11-19T08:00:00Z</updated></entry></feed>'
    ).encode()

    def abrir(url, accept):
        return (200, feed) if url.endswith("s53.xml") else (404, b"")

    comunidades = [{"id": "andalucia", "nombre": "Andalucía", "boletin": {"nombre": "BOJA", "url": "https://x.es/boja"},
                    "feeds_oposiciones": ["https://www.juntadeandalucia.es/boja/distribucion/s53.xml"]}]
    destino = tmp_path / "ccaa.json"
    resumen = actualizar_autonomicas(abrir, comunidades, destino, date(2026, 11, 20))
    datos = json.loads(destino.read_text("utf-8"))
    assert resumen["anuncios"] == 1 and datos[0]["organismo"] == "Andalucía" and datos[0]["fecha"] == "2026-11-19"
