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
from .temarios import comprobar_enlaces, extraer_temas
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


def actualizar_normas(cliente: BoeClient, indice_normas: list[dict], carpeta: Path) -> dict:
    """Descarga las normas que han cambiado. Un fallo en una no impide actualizar las demás."""
    carpeta.mkdir(parents=True, exist_ok=True)
    resumen = {"actualizadas": 0, "sin_cambios": 0, "con_error": 0}
    for entrada in indice_normas:
        destino = carpeta / f"{entrada['id']}.json"
        try:
            actual = json.loads(destino.read_text("utf-8")) if destino.exists() else None
            if not necesita_actualizar(actual, cliente.indice(entrada["id"])):
                print(f"= {entrada['nombre']}: sin cambios")
                resumen["sin_cambios"] += 1
                continue
            norma = construir_norma(cliente, entrada["id"])
            if not comprobar_titulo(norma["titulo"], entrada["referencia"]):
                raise ErrorBoe(f"el BOE titula '{norma['titulo']}'; revisa el identificador")
            if not norma["articulos"]:
                raise ErrorBoe("la respuesta no contiene artículos")
        except Exception as error:  # noqa: BLE001 - se informa y se sigue con la siguiente
            print(f"! {entrada['nombre']}: {type(error).__name__}: {error}", file=sys.stderr)
            resumen["con_error"] += 1
            continue
        destino.write_text(json.dumps(norma, ensure_ascii=False, separators=(",", ":")), "utf-8")
        print(f"+ {entrada['nombre']}: {len(norma['articulos'])} bloques")
        resumen["actualizadas"] += 1
    return resumen


def actualizar_temarios(cliente, oposiciones: list[dict], convocatorias: list[dict], carpeta: Path) -> int:
    """Guarda el programa (temas) del anexo de la convocatoria más reciente de cada oposición."""
    carpeta.mkdir(parents=True, exist_ok=True)
    guardados = 0
    abiertas = [c for c in convocatorias if c.get("tipo") == "convocatoria" and c.get("url_xml")]
    for op in oposiciones:
        claves = [k.lower() for k in op.get("boe", [])]
        for conv in sorted(abiertas, key=lambda c: c["fecha"] if "fecha" in c else "", reverse=True):
            if not any(k in conv["titulo"].lower() for k in claves):
                continue
            try:
                temas = extraer_temas(cliente.parrafos_xml(conv["url_xml"]))
            except Exception as error:  # noqa: BLE001
                print(f"! temario {op['id']}: {error}", file=sys.stderr)
                continue
            if temas:
                datos = {"fuente": conv["id"], "url": conv.get("url_html", ""), "temas": temas}
                (carpeta / f"{op['id']}.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), "utf-8")
                guardados += 1
                break
    return guardados


def _sonda_http(url: str) -> int:
    import urllib.error
    import urllib.request

    peticion = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (comprobador de enlaces)"})
    try:
        with urllib.request.urlopen(peticion, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code if e.code != 403 else 200  # 403 = bloquea robots, pero la página existe


def _todas_las_urls() -> list[str]:
    urls: set[str] = set()
    for op in json.loads((DATOS / "oposiciones.json").read_text("utf-8")):
        urls.update(e["url"] for e in op.get("enlaces", []))
        urls.update(r["url"] for r in op.get("recursos", []) if "url" in r)
    rec = json.loads((DATOS / "recursos.json").read_text("utf-8"))
    for c in rec["comunidades"]:
        urls.update([c["boletin"]["url"], c["empleo"], c["sanidad"]["url"], c["educacion"]])
    urls.update(r["url"] for r in rec["estado"] + rec["academias"])
    return sorted(urls)


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
    sub.add_parser("temarios")
    sub.add_parser("enlaces")
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
    elif args.orden == "temarios":
        oposiciones = json.loads((DATOS / "oposiciones.json").read_text("utf-8"))
        convocatorias = json.loads((DATOS / "convocatorias.json").read_text("utf-8"))
        n = actualizar_temarios(cliente, oposiciones, convocatorias, DATOS / "temarios")
        print(f"Temarios: {n} oposiciones con programa oficial")
    elif args.orden == "enlaces":
        estado = comprobar_enlaces(_todas_las_urls(), _sonda_http)
        (DATOS / "enlaces_estado.json").write_text(json.dumps(estado, indent=0, sort_keys=True), "utf-8")
        print(f"Enlaces: {sum(estado.values())} correctos, {len(estado) - sum(estado.values())} caídos")
    else:
        indice = json.loads((DATOS / "normas.json").read_text("utf-8"))
        resumen = actualizar_normas(cliente, indice, DATOS / "normas")
        print(f"Normas: {resumen['actualizadas']} actualizadas, {resumen['sin_cambios']} sin cambios, {resumen['con_error']} con error")
    return 0


if __name__ == "__main__":
    sys.exit(main())
