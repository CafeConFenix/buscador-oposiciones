"""Salidas pensadas para que la web se encuentre y se siga: avisos RSS, páginas indexables y mapa del sitio."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import format_datetime
from html import escape

TIPOS_CON_AVISO = {"convocatoria", "admitidos"}
MAXIMO_AVISOS = 50


def generar_rss(convocatorias: list[dict], base_url: str, ahora: datetime) -> str:
    rss = ET.Element("rss", version="2.0")
    canal = ET.SubElement(rss, "channel")
    ET.SubElement(canal, "title").text = "Oposiciones de España: convocatorias del BOE"
    ET.SubElement(canal, "link").text = base_url
    ET.SubElement(canal, "description").text = "Convocatorias y listas de admitidos de oposiciones publicadas en el BOE."
    ET.SubElement(canal, "language").text = "es"
    ET.SubElement(canal, "lastBuildDate").text = format_datetime(ahora)
    elegidas = [c for c in convocatorias if c.get("tipo") in TIPOS_CON_AVISO]
    for c in sorted(elegidas, key=lambda c: c["fecha"], reverse=True)[:MAXIMO_AVISOS]:
        item = ET.SubElement(canal, "item")
        ET.SubElement(item, "title").text = c["titulo"]
        ET.SubElement(item, "link").text = c.get("url_html") or base_url
        ET.SubElement(item, "guid", isPermaLink="false").text = c["id"]
        ET.SubElement(item, "description").text = c.get("organismo", "")
        dia = datetime.fromisoformat(c["fecha"]).replace(hour=8, tzinfo=timezone.utc)
        ET.SubElement(item, "pubDate").text = format_datetime(dia)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(rss, encoding="unicode")


def pagina_oposicion(o: dict, base_url: str) -> str:
    """Página estática de una oposición: la ficha completa vive en la web, pero esta se puede indexar y compartir."""
    nombre = escape(o["nombre"])
    resumen = f"Temario, normas en PDF, libros, apuntes y fechas de examen de {o['nombre']}."
    enlaces = "".join(
        f'<li><a href="{escape(e["url"], quote=True)}" rel="noopener">{escape(e["titulo"])}</a></li>' for e in o.get("enlaces", [])
    )
    grupo = f"Grupo {escape(o['grupo'])} · " if o.get("grupo") else ""
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{nombre} | Oposiciones de España</title>
  <meta name="description" content="{escape(resumen, quote=True)}">
  <link rel="canonical" href="{base_url}oposicion/{o['id']}/">
  <link rel="stylesheet" href="../../css/estilos.css">
</head>
<body>
  <main>
    <div class="banda"><div class="interior">
      <p class="migas"><a href="../../">← Todas las oposiciones</a></p>
      <h1>{nombre}</h1>
      <p class="intro">{grupo}{escape(o.get('area', ''))}</p>
      <p><a class="boton" href="../../#/oposicion/{o['id']}">Abrir temario, plan de estudio y recursos</a></p>
    </div></div>
    <div class="interior cuerpo">
      <p>{escape(resumen)}</p>
      <h2>Enlaces oficiales</h2>
      <ul class="enlaces">{enlaces}</ul>
    </div>
  </main>
</body>
</html>
"""


def generar_sitemap(oposiciones: list[dict], base_url: str) -> str:
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for url in [base_url] + [f"{base_url}oposicion/{o['id']}/" for o in oposiciones]:
        ET.SubElement(ET.SubElement(urlset, "url"), "loc").text = url
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(urlset, encoding="unicode")
