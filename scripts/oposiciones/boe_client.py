"""Cliente mínimo de la API de datos abiertos del BOE (https://www.boe.es/datosabiertos/api/api.php).

La función de red se inyecta (`abrir`) para poder probar el cliente sin conexión.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Callable

BASE = "https://www.boe.es/datosabiertos/api"
Abrir = Callable[[str, str], tuple[int, bytes]]


class ErrorBoe(Exception):
    pass


@dataclass(frozen=True)
class Bloque:
    id: str
    tipo: str
    titulo: str
    parrafos: list[str]


def abrir_http(url: str, accept: str, pausa: float = 0.2) -> tuple[int, bytes]:
    """Petición real. Devuelve (estado, cuerpo); los 4xx no lanzan excepción."""
    peticion = urllib.request.Request(
        url, headers={"Accept": accept, "User-Agent": "oposiciones-es (github pages; datos abiertos BOE)"}
    )
    time.sleep(pausa)  # cortesía con el servidor
    try:
        with urllib.request.urlopen(peticion, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class BoeClient:
    def __init__(self, abrir: Abrir = abrir_http):
        self._abrir = abrir

    def sumario(self, fecha: str) -> dict | None:
        """Sumario del BOE de un día (AAAA-MM-DD). None si ese día no hay BOE (404)."""
        url = f"{BASE}/boe/sumario/{fecha.replace('-', '')}"
        cuerpo = self._pedir(url, "application/json", permitir_404=True)
        return None if cuerpo is None else json.loads(cuerpo)

    def indice(self, id_norma: str) -> list[dict]:
        """Bloques de una norma con su fecha de actualización.

        En JSON la API devuelve `data` como lista (o como objeto, según el endpoint) y cada elemento
        puede venir dentro de un nodo `bloque`; se acepta cualquiera de las formas.
        """
        cuerpo = self._pedir(f"{BASE}/legislacion-consolidada/id/{id_norma}/texto/indice", "application/json")
        return _buscar_bloques(json.loads(cuerpo).get("data"))

    def texto_completo(self, id_norma: str) -> list[Bloque]:
        """Todos los bloques de la norma en una sola petición (solo XML). Se queda con la versión vigente."""
        cuerpo = self._pedir(f"{BASE}/legislacion-consolidada/id/{id_norma}/texto", "application/xml")
        nodos = ET.fromstring(cuerpo).findall(".//bloque")
        return [_a_bloque(n, n.get("id", "")) for n in nodos]

    def bloque(self, id_norma: str, id_bloque: str) -> Bloque:
        """Texto vigente (última versión) de un bloque. La API sólo ofrece XML aquí."""
        cuerpo = self._pedir(
            f"{BASE}/legislacion-consolidada/id/{id_norma}/texto/bloque/{id_bloque}", "application/xml"
        )
        nodo = ET.fromstring(cuerpo).find(".//bloque")
        if nodo is None:
            raise ErrorBoe(f"Bloque {id_bloque} de {id_norma} sin contenido")
        return _a_bloque(nodo, id_bloque)

    def titulo_norma(self, id_norma: str) -> str:
        cuerpo = self._pedir(f"{BASE}/legislacion-consolidada/id/{id_norma}/metadatos", "application/json")
        return _buscar_clave(json.loads(cuerpo).get("data"), "titulo") or ""

    def texto_xml(self, url: str) -> str:
        """Texto plano de un documento del sumario (url_xml)."""
        cuerpo = self._pedir(url, "application/xml")
        return " ".join("".join(ET.fromstring(cuerpo).itertext()).split())

    def parrafos_xml(self, url: str) -> str:
        """Texto de un documento del sumario conservando un párrafo por línea."""
        cuerpo = self._pedir(url, "application/xml")
        return "\n".join(" ".join("".join(p.itertext()).split()) for p in ET.fromstring(cuerpo).iter("p"))

    def _pedir(self, url: str, accept: str, permitir_404: bool = False) -> bytes | None:
        estado, cuerpo = self._abrir(url, accept)
        if estado == 200:
            return cuerpo
        if estado == 404 and permitir_404:
            return None
        raise ErrorBoe(f"BOE respondió {estado} en {url}")


def _a_bloque(nodo: ET.Element, id_por_defecto: str) -> Bloque:
    versiones = nodo.findall("version")
    vigente = versiones[-1] if versiones else nodo
    parrafos = ["".join(p.itertext()).strip() for p in vigente.findall("p")]
    return Bloque(
        id=nodo.get("id", id_por_defecto),
        tipo=nodo.get("tipo", ""),
        titulo=nodo.get("titulo", ""),
        parrafos=[p for p in parrafos if p],
    )


def _buscar_bloques(obj) -> list[dict]:
    """Recorre la respuesta y devuelve los diccionarios que describen un bloque (tienen `id`)."""
    if isinstance(obj, list):
        return [b for elemento in obj for b in _buscar_bloques(elemento)]
    if isinstance(obj, dict):
        if "id" in obj and not isinstance(obj["id"], (dict, list)):
            return [obj]
        return [b for valor in obj.values() for b in _buscar_bloques(valor)]
    return []


def _buscar_clave(obj, clave: str):
    if isinstance(obj, dict):
        if clave in obj and isinstance(obj[clave], str):
            return obj[clave]
        for v in obj.values():
            hallado = _buscar_clave(v, clave)
            if hallado:
                return hallado
    elif isinstance(obj, list):
        for v in obj:
            hallado = _buscar_clave(v, clave)
            if hallado:
                return hallado
    return None
