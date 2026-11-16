import test from "node:test";
import assert from "node:assert/strict";
import { construirEventos, agruparPorMes, filtrarEventos } from "../../site/js/calendario.js";

const convocatorias = [
  { id: "A", fecha: "2026-11-13", titulo: "Convoca administrativo", organismo: "MINISTERIO X", tipo: "convocatoria", url_html: "https://boe/A", fecha_examen: null },
  { id: "B", fecha: "2026-11-13", titulo: "Admitidos auxiliar", organismo: "MINISTERIO X", tipo: "admitidos", url_html: "https://boe/B", fecha_examen: "2027-03-14" },
  { id: "C", fecha: "2026-11-12", titulo: "Concurso de puestos", organismo: "MINISTERIO Y", tipo: "concurso", url_html: "https://boe/C", fecha_examen: null },
];
const examenes = [
  { fecha: "2027-01-30", titulo: "Examen Justicia (Auxilio Judicial)", url: "https://ejemplo.es/just", fuente: "Convocatoria BOE" },
];

test("convierte anuncios del BOE y exámenes manuales en eventos", () => {
  const ev = construirEventos(convocatorias, examenes);
  const tipos = ev.map((e) => `${e.fecha}|${e.tipo}`);
  assert.ok(tipos.includes("2026-11-13|convocatoria"));
  assert.ok(tipos.includes("2027-03-14|examen"));
  assert.ok(tipos.includes("2027-01-30|examen"));
  assert.ok(!tipos.some((t) => t.endsWith("concurso")), "los concursos de traslado no son oposiciones");
});

test("el examen cita el anuncio oficial de origen", () => {
  const ev = construirEventos(convocatorias, []).find((e) => e.tipo === "examen");
  assert.equal(ev.url, "https://boe/B");
});

test("agrupa por mes en orden cronológico con etiqueta en español", () => {
  const meses = agruparPorMes(construirEventos(convocatorias, examenes));
  assert.deepEqual(meses.map((m) => m.clave), ["2026-11", "2027-01", "2027-03"]);
  assert.equal(meses[1].etiqueta, "enero de 2027");
});

test("filtra por tipo y por texto sin tildes", () => {
  const ev = construirEventos(convocatorias, examenes);
  assert.equal(filtrarEventos(ev, { tipo: "examen" }).length, 2);
  assert.equal(filtrarEventos(ev, { texto: "JUSTICIA" }).length, 1);
  assert.equal(filtrarEventos(ev, { tipo: "todos", texto: "" }).length, ev.length);
});

test("filtra por fecha mínima", () => {
  const ev = construirEventos(convocatorias, examenes);
  assert.deepEqual(filtrarEventos(ev, { desde: "2027-01-01" }).map((e) => e.fecha), ["2027-01-30", "2027-03-14"]);
});

test("formatearDia da día de la semana abreviado y número", async () => {
  const { formatearDia } = await import("../../site/js/calendario.js");
  assert.equal(formatearDia("2026-11-13"), "vie 13");
  assert.equal(formatearDia("2027-03-14"), "dom 14");
});
