import { normalizar } from "./busqueda.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Eventos del calendario:
 *  - "convocatoria": día en que el BOE publica la convocatoria de un proceso selectivo.
 *  - "examen": fecha de un ejercicio, leída del anuncio del BOE o aportada en data/examenes.json.
 * Los concursos de traslado y otros anuncios no son oposiciones y no entran.
 */
export function construirEventos(convocatorias, examenes) {
  const eventos = [];
  for (const c of convocatorias) {
    if (c.tipo === "convocatoria") {
      eventos.push({ fecha: c.fecha, tipo: "convocatoria", titulo: c.titulo, organismo: c.organismo, url: c.url_html, fuente: "BOE" });
    }
    if (c.fecha_examen) {
      eventos.push({ fecha: c.fecha_examen, tipo: "examen", titulo: c.titulo, organismo: c.organismo, url: c.url_html, fuente: "BOE" });
    }
  }
  for (const e of examenes) {
    eventos.push({ fecha: e.fecha, tipo: "examen", titulo: e.titulo, organismo: e.organismo ?? "", url: e.url, fuente: e.fuente ?? "" });
  }
  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, "es"));
}

export function agruparPorMes(eventos) {
  const meses = new Map();
  for (const e of eventos) {
    const clave = e.fecha.slice(0, 7);
    if (!meses.has(clave)) {
      const [anio, mes] = clave.split("-");
      meses.set(clave, { clave, etiqueta: `${MESES[Number(mes) - 1]} de ${anio}`, eventos: [] });
    }
    meses.get(clave).eventos.push(e);
  }
  return [...meses.values()].sort((a, b) => a.clave.localeCompare(b.clave));
}

export function filtrarEventos(eventos, { tipo = "todos", texto = "", desde = "" } = {}) {
  const q = normalizar(texto);
  return eventos.filter(
    (e) =>
      (tipo === "todos" || e.tipo === tipo) &&
      (!desde || e.fecha >= desde) &&
      (!q || normalizar(`${e.titulo} ${e.organismo}`).includes(q)),
  );
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "vie 13": para listas ya agrupadas por mes. */
export function formatearDia(iso) {
  const fecha = new Date(`${iso}T12:00:00Z`);
  return `${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()}`;
}

export function formatearFecha(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}
