"""Extrae de un sumario del BOE los anuncios de la sección II.B (oposiciones y concursos)."""

from __future__ import annotations

from dataclasses import dataclass

CODIGOS_SECCION_OPOSICIONES = {"2B", "II.B", "IIB"}


def _es_seccion_de_oposiciones(seccion: dict) -> bool:
    nombre = str(seccion.get("nombre", "")).lower()
    return seccion.get("codigo") in CODIGOS_SECCION_OPOSICIONES or "oposiciones y concursos" in nombre


@dataclass(frozen=True)
class Convocatoria:
    id: str
    fecha: str  # AAAA-MM-DD, día de publicación en el BOE
    titulo: str
    organismo: str
    tipo: str
    url_html: str = ""
    url_pdf: str = ""
    url_xml: str = ""


def clasificar_titulo(titulo: str) -> str:
    """Devuelve convocatoria | admitidos | resultado | concurso | correccion | otros."""
    t = titulo.lower()
    if t.startswith("corrección de errores") or t.startswith("correccion de errores"):
        return "correccion"
    if "concurso" in t and ("provisión de puestos" in t or "libre designación" in t or "traslados" in t):
        return "concurso"
    if "admitidos y excluidos" in t or "admitidas y excluidas" in t:
        return "admitidos"
    if "se convoca" in t or "se convocan" in t:
        return "convocatoria"
    if "relación de aprobados" in t or "relación de personas aprobadas" in t or "aspirantes que han superado" in t:
        return "resultado"
    return "otros"


def extraer_convocatorias(sumario: dict | None) -> list[Convocatoria]:
    if not sumario:
        return []
    datos = (sumario.get("data") or {}).get("sumario")
    if not datos:
        return []
    fecha = _fecha_iso(datos.get("metadatos", {}).get("fecha_publicacion", ""))
    resultado: list[Convocatoria] = []
    for diario in _como_lista(datos.get("diario")):
        for seccion in _como_lista(diario.get("seccion")):
            if not _es_seccion_de_oposiciones(seccion):
                continue
            for departamento in _como_lista(seccion.get("departamento")):
                organismo = departamento.get("nombre", "")
                for item in _items_de(departamento):
                    resultado.append(_a_convocatoria(item, fecha, organismo))
    return resultado


def _items_de(departamento: dict):
    yield from _como_lista(departamento.get("item"))
    for epigrafe in _como_lista(departamento.get("epigrafe")):
        yield from _como_lista(epigrafe.get("item"))


def _a_convocatoria(item: dict, fecha: str, organismo: str) -> Convocatoria:
    titulo = item.get("titulo", "").strip()
    url_pdf = item.get("url_pdf") or {}
    if isinstance(url_pdf, dict):
        url_pdf = url_pdf.get("texto", "")
    return Convocatoria(
        id=item["identificador"],
        fecha=fecha,
        titulo=titulo,
        organismo=organismo,
        tipo=clasificar_titulo(titulo),
        url_html=item.get("url_html", ""),
        url_pdf=url_pdf,
        url_xml=item.get("url_xml", ""),
    )


def _como_lista(valor) -> list:
    # La API en JSON devuelve un objeto cuando hay uno solo y una lista cuando hay varios.
    if valor is None:
        return []
    return valor if isinstance(valor, list) else [valor]


def _fecha_iso(aaaammdd: str) -> str:
    return f"{aaaammdd[:4]}-{aaaammdd[4:6]}-{aaaammdd[6:8]}" if len(aaaammdd) == 8 else ""
