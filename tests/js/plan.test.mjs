import test from "node:test";
import assert from "node:assert/strict";
import { planificarEstudio, diasHasta } from "../../site/js/plan.js";
import { filtrarEventos } from "../../site/js/calendario.js";

test("diasHasta cuenta los días naturales hasta una fecha", () => {
  assert.equal(diasHasta("2027-03-14", "2027-03-04"), 10);
  assert.equal(diasHasta("2027-03-01", "2027-03-04"), -3);
  assert.equal(diasHasta("2027-03-04", "2027-03-04"), 0);
});

test("reparte los temas por semanas y reserva el final para repasar", () => {
  const plan = planificarEstudio({ totalTemas: 10, hoy: "2027-01-04", examen: "2027-03-01" }); // 8 semanas
  const estudio = plan.semanas.filter((s) => s.tipo === "estudio");
  const repaso = plan.semanas.filter((s) => s.tipo === "repaso");
  assert.equal(plan.semanas.length, 8);
  assert.equal(repaso.length, 2);
  assert.equal(estudio[0].temas[0], 1);
  assert.equal(estudio.at(-1).temas[1], 10);
  // sin huecos ni solapes entre semanas consecutivas
  estudio.slice(1).forEach((s, i) => assert.equal(s.temas[0], estudio[i].temas[1] + 1));
});

test("la primera semana empieza hoy y cada semana dura siete días", () => {
  const plan = planificarEstudio({ totalTemas: 4, hoy: "2027-01-04", examen: "2027-02-01" });
  assert.equal(plan.semanas[0].desde, "2027-01-04");
  assert.equal(plan.semanas[0].hasta, "2027-01-10");
  assert.equal(plan.semanas[1].desde, "2027-01-11");
});

test("si sobran semanas, las que no hacen falta para estudiar se dedican a repasar", () => {
  const plan = planificarEstudio({ totalTemas: 3, hoy: "2027-01-04", examen: "2027-03-15" }); // 10 semanas
  assert.equal(plan.semanas.filter((s) => s.tipo === "estudio").length, 3);
  assert.equal(plan.semanas.filter((s) => s.tipo === "repaso").length, 7);
});

test("con menos de una semana no hay plan y se avisa", () => {
  const plan = planificarEstudio({ totalTemas: 20, hoy: "2027-01-04", examen: "2027-01-08" });
  assert.deepEqual(plan.semanas, []);
  assert.ok(plan.aviso);
});

test("si hay más temas que semanas, algunas semanas llevan varios temas", () => {
  const plan = planificarEstudio({ totalTemas: 30, hoy: "2027-01-04", examen: "2027-02-15" }); // 6 semanas
  const estudio = plan.semanas.filter((s) => s.tipo === "estudio");
  assert.ok(estudio.every((s) => s.temas[1] >= s.temas[0]));
  assert.equal(estudio.at(-1).temas[1], 30);
});

test("el calendario se puede filtrar por comunidad", () => {
  const eventos = [
    { fecha: "2027-01-01", tipo: "convocatoria", titulo: "x", organismo: "Comunidad de Madrid" },
    { fecha: "2027-01-02", tipo: "convocatoria", titulo: "y", organismo: "Galicia" },
    { fecha: "2027-01-03", tipo: "convocatoria", titulo: "z", organismo: "Ministerio de Justicia" },
  ];
  assert.deepEqual(filtrarEventos(eventos, { comunidad: "madrid" }).map((e) => e.titulo), ["x"]);
  assert.equal(filtrarEventos(eventos, { comunidad: "todas" }).length, 3);
  assert.deepEqual(filtrarEventos(eventos, { comunidad: "estado" }).map((e) => e.titulo), ["z"]);
});

import { construirEventos } from "../../site/js/calendario.js";

test("el fin de plazo de una convocatoria se convierte en un evento con su tasa", () => {
  const conv = [{ id: "a", tipo: "convocatoria", fecha: "2026-11-13", titulo: "Se convoca X", organismo: "Min", url_html: "u", fin_plazo: "2026-12-11", plazo: "20 días hábiles", tasa: 12.38 }];
  const ev = construirEventos(conv, []);
  const plazo = ev.find((e) => e.tipo === "plazo");
  assert.equal(plazo.fecha, "2026-12-11");
  assert.equal(plazo.tasa, 12.38);
  assert.equal(plazo.plazo, "20 días hábiles");
  assert.equal(ev.filter((e) => e.tipo === "convocatoria").length, 1);
});

test("sin fin de plazo no se crea evento de plazo", () => {
  const ev = construirEventos([{ id: "a", tipo: "convocatoria", fecha: "2026-11-13", titulo: "X", organismo: "M", url_html: "u" }], []);
  assert.equal(ev.filter((e) => e.tipo === "plazo").length, 0);
});

test("la fuente de cada evento es la del anuncio: BOE o boletín autonómico", () => {
  const ev = construirEventos([
    { id: "a", tipo: "convocatoria", fecha: "2026-11-13", titulo: "X", organismo: "M", url_html: "u" },
    { id: "ccaa-1", tipo: "convocatoria", fecha: "2026-11-14", titulo: "Y", organismo: "Comunidad de Madrid", url_html: "u", fuente: "boletín autonómico" },
  ], []);
  assert.equal(ev.find((e) => e.titulo === "X").fuente, "BOE");
  assert.equal(ev.find((e) => e.titulo === "Y").fuente, "boletín autonómico");
});
