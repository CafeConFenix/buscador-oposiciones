"""Convocatorias de las comunidades autónomas leídas de los feeds (RSS/Atom) de sus boletines.

El robot descubre solo los feeds: busca en la web de cada boletín y de su portal de empleo los enlaces de
tipo RSS/Atom. Si una comunidad no ofrece ninguno, se salta y se anota en el resumen.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin

from .convocatorias import clasificar_titulo

CONSERVAR_DIAS = 400
MAX_FEEDS_POR_COMUNIDAD = 3
_LINK = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
_ANCLA = re.compile(r"<a\b[^>]*?href=[\"']([^\"']+)[\"']", re.IGNORECASE)
_ATRIBUTO = re.compile(r"(\w+)=[\"']([^\"']*)[\"']")
_OPOSICIONES = (
    "oposicion", "proceso selectivo", "procesos selectivos", "pruebas selectivas", "convocatoria", "convocan",
    "bolsa de empleo", "bolsa de trabajo", "oferta de empleo", "concurso-oposicion", "acceso libre",
)


def _sin_tildes(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def descubrir_feeds(html: str, base_url: str) -> list[str]:
    feeds: list[str] = []
    for etiqueta in _LINK.findall(html):
        atributos = {k.lower(): v for k, v in _ATRIBUTO.findall(etiqueta)}
        if re.search(r"(rss|atom)\+xml", atributos.get("type", ""), re.IGNORECASE) and atributos.get("href"):
            feeds.append(urljoin(base_url, atributos["href"]))
    for href in _ANCLA.findall(html):
        if re.search(r"(rss|atom|feed)", href, re.IGNORECASE) and not href.lower().startswith(("mailto:", "javascript:")):
            feeds.append(urljoin(base_url, href))
    return list(dict.fromkeys(feeds))


def _fecha_iso(texto: str | None) -> str:
    if not texto:
        return ""
    texto = texto.strip()
    try:
        return parsedate_to_datetime(texto).date().isoformat()
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(texto.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return texto[:10] if re.match(r"\d{4}-\d{2}-\d{2}", texto) else ""


def _nombre_local(etiqueta: str) -> str:
    return etiqueta.rsplit("}", 1)[-1]


def leer_feed(cuerpo: bytes) -> list[dict]:
    try:
        raiz = ET.fromstring(cuerpo)
    except ET.ParseError:
        return []
    items: list[dict] = []
    for nodo in raiz.iter():
        if _nombre_local(nodo.tag) not in {"item", "entry"}:
            continue
        datos: dict[str, str] = {}
        for hijo in nodo:
            nombre = _nombre_local(hijo.tag)
            if nombre == "title":
                datos["titulo"] = " ".join((hijo.text or "").split())
            elif nombre == "link":
                datos.setdefault("url", (hijo.get("href") or hijo.text or "").strip())
            elif nombre in {"pubDate", "updated", "published", "date"}:
                datos.setdefault("fecha", _fecha_iso(hijo.text))
        if datos.get("titulo") and datos.get("url"):
            items.append({"titulo": datos["titulo"], "url": datos["url"], "fecha": datos.get("fecha", "")})
    return items


def es_de_oposiciones(titulo: str) -> bool:
    t = _sin_tildes(titulo)
    return any(clave in t for clave in _OPOSICIONES)


def _feeds_de(abrir, comunidad: dict) -> list[str]:
    encontrados: list[str] = []
    for url in (comunidad["boletin"]["url"], comunidad.get("empleo", "")):
        if not url:
            continue
        estado, cuerpo = abrir(url, "text/html")
        if estado != 200:
            raise OSError(f"{url} respondió {estado}")
        encontrados += descubrir_feeds(cuerpo.decode("utf-8", errors="replace"), url)
    return list(dict.fromkeys(encontrados))[:MAX_FEEDS_POR_COMUNIDAD]


def actualizar_autonomicas(abrir, comunidades: list[dict], destino: Path, hoy: date) -> dict:
    existentes = json.loads(destino.read_text("utf-8")) if destino.exists() else []
    por_id = {c["id"]: c for c in existentes}
    resumen = {"comunidades_con_fuente": 0, "sin_fuente": 0, "anuncios": 0, "con_error": 0}
    for comunidad in comunidades:
        try:
            feeds = _feeds_de(abrir, comunidad)
        except Exception as error:  # noqa: BLE001 - una comunidad caída no debe parar las demás
            print(f"! {comunidad['nombre']}: {error}", file=sys.stderr)
            resumen["con_error"] += 1
            continue
        if not feeds:
            print(f"= {comunidad['nombre']}: sin feed publicado")
            resumen["sin_fuente"] += 1
            continue
        leidos = 0
        for url in feeds:
            try:
                estado, cuerpo = abrir(url, "application/xml")
                if estado != 200:
                    raise OSError(f"respondió {estado}")
                for item in leer_feed(cuerpo):
                    if not es_de_oposiciones(item["titulo"]):
                        continue
                    tipo = clasificar_titulo(item["titulo"])
                    registro = {
                        "id": "ccaa-" + hashlib.sha1(item["url"].encode()).hexdigest()[:12],
                        "fecha": item["fecha"] or hoy.isoformat(),
                        "titulo": item["titulo"],
                        "organismo": comunidad["nombre"],
                        "tipo": "convocatoria" if tipo == "otros" else tipo,
                        "url_html": item["url"],
                        "fecha_examen": None,
                        "fuente": "boletín autonómico",
                    }
                    por_id.setdefault(registro["id"], registro)
                    leidos += 1
            except Exception as error:  # noqa: BLE001
                print(f"! {comunidad['nombre']} ({url}): {error}", file=sys.stderr)
                resumen["con_error"] += 1
        if leidos:
            resumen["comunidades_con_fuente"] += 1
            print(f"+ {comunidad['nombre']}: {leidos} anuncios de oposiciones")
    limite = (hoy - timedelta(days=CONSERVAR_DIAS)).isoformat()
    vigentes = sorted((c for c in por_id.values() if c["fecha"] >= limite), key=lambda c: (c["fecha"], c["id"]), reverse=True)
    destino.write_text(json.dumps(vigentes, ensure_ascii=False, indent=1), "utf-8")
    resumen["anuncios"] = len(vigentes)
    return resumen
