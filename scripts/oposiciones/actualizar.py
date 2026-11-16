"""Actualiza los datos de la web desde el BOE.

Uso (lo ejecuta a diario GitHub Actions):
    python -m oposiciones.actualizar convocatorias --dias 7
    python -m oposiciones.actualizar normas
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .boe_client import BoeClient, ErrorBoe
from .convocatorias import extraer_convocatorias
from .fechas import fecha_de_examen
from .ical import generar_ics
from .normas import comprobar_titulo, construir_norma, necesita_actualizar

DATOS = Path(__file__).resolve().parents[2] / "site" / "data"
PRIMERA_CARGA_DIAS = 180


def actualizar_convocatorias(
    cliente: BoeClient, hoy: date, dias: int, existentes: list[dict], conservar_dias: int = 400
) -> list[dict]:
    por_id = {c["id"]: c for c in existentes}
    for atras in range(dias):
        dia = hoy - timedelta(days=atras)
        for conv in extraer_convocatorias(cliente.sumario(dia.isoformat())):
            if conv.id in por_id and "fecha_examen" in por_id[conv.id]:
                por_id[conv.id].update(titulo=conv.titulo)  # el BOE es la fuente de verdad
                continue
            registro = asdict(conv)
            registro["fecha_examen"] = _buscar_fecha_examen(cliente, conv) if conv.tipo == "admitidos" else None
            por_id[conv.id] = registro
    limite = (hoy - timedelta(days=conservar_dias)).isoformat()
    vigentes = [c for c in por_id.values() if c["fecha"] >= limite]
    return sorted(vigentes, key=lambda c: (c["fecha"], c["id"]), reverse=True)


def _buscar_fecha_examen(cliente: BoeClient, conv) -> str | None:
    if not conv.url_xml:
        return None
    try:
        return fecha_de_examen(cliente.texto_xml(conv.url_xml))
    except Exception as error:  # un anuncio ilegible no debe parar la actualización
        print(f"  aviso: no se pudo leer {conv.id}: {error}", file=sys.stderr)
        return None


def actualizar_normas(cliente: BoeClient, indice_normas: list[dict], carpeta: Path) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    for entrada in indice_normas:
        destino = carpeta / f"{entrada['id']}.json"
        actual = json.loads(destino.read_text("utf-8")) if destino.exists() else None
        try:
            if not necesita_actualizar(actual, cliente.indice(entrada["id"])):
                print(f"= {entrada['nombre']}: sin cambios")
                continue
            norma = construir_norma(cliente, entrada["id"])
        except ErrorBoe as error:
            print(f"! {entrada['nombre']}: {error}", file=sys.stderr)
            continue
        if not comprobar_titulo(norma["titulo"], entrada["referencia"]):
            print(f"! {entrada['nombre']}: el BOE titula '{norma['titulo']}'; revisa el id", file=sys.stderr)
            continue
        destino.write_text(json.dumps(norma, ensure_ascii=False, separators=(",", ":")), "utf-8")
        print(f"+ {entrada['nombre']}: {len(norma['articulos'])} bloques")


def eventos_de_examen(convocatorias: list[dict], manuales: list[dict]) -> list[dict]:
    """Exámenes leídos del BOE más los aportados a mano en examenes.json, listos para el .ics."""
    del_boe = [
        {"id": c["id"], "fecha": c["fecha_examen"], "titulo": c["titulo"], "url": c.get("url_html", "")}
        for c in convocatorias
        if c.get("fecha_examen")
    ]
    a_mano = [
        {"id": f"manual-{i}", "fecha": e["fecha"], "titulo": e["titulo"], "url": e.get("url", "")}
        for i, e in enumerate(manuales)
    ]
    return sorted(del_boe + a_mano, key=lambda e: e["fecha"])


def _escribir_salidas(convocatorias: list[dict], hoy: date) -> None:
    archivo_manual = DATOS / "examenes.json"
    manuales = json.loads(archivo_manual.read_text("utf-8")) if archivo_manual.exists() else []
    (DATOS / "examenes.ics").write_text(generar_ics(eventos_de_examen(convocatorias, manuales), hoy), "utf-8")
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (DATOS / "estado.json").write_text(json.dumps({"actualizado": ahora}), "utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="orden", required=True)
    conv = sub.add_parser("convocatorias")
    conv.add_argument("--dias", type=int, default=7)
    sub.add_parser("normas")
    args = parser.parse_args(argv)

    cliente = BoeClient()
    if args.orden == "convocatorias":
        archivo = DATOS / "convocatorias.json"
        existentes = json.loads(archivo.read_text("utf-8")) if archivo.exists() else []
        dias = args.dias if existentes else max(args.dias, PRIMERA_CARGA_DIAS)  # primera vez: rellenar hacia atrás
        hoy = date.today()
        nuevas = actualizar_convocatorias(cliente, hoy, dias, existentes)
        archivo.write_text(json.dumps(nuevas, ensure_ascii=False, indent=1), "utf-8")
        _escribir_salidas(nuevas, hoy)
        print(f"{len(nuevas)} anuncios guardados ({dias} días revisados)")
    else:
        indice = json.loads((DATOS / "normas.json").read_text("utf-8"))
        actualizar_normas(cliente, indice, DATOS / "normas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
