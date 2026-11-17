import test from "node:test";
import assert from "node:assert/strict";
import { notaTest, costeOposicion } from "../../site/js/calculadoras.js";
import { construirMailto } from "../../site/js/ayuda.js";

test("la nota del test resta los errores con la penalización indicada", () => {
  // 60 preguntas: 40 aciertos, 12 errores, 8 en blanco; cada 3 errores restan 1 acierto
  const r = notaTest({ aciertos: 40, errores: 12, blancos: 8, penalizacion: 1 / 3 });
  assert.equal(r.preguntas, 60);
  assert.equal(r.puntos, 36);
  assert.equal(r.nota, 6);
});

test("la nota nunca es negativa ni pasa de 10", () => {
  assert.equal(notaTest({ aciertos: 0, errores: 30, blancos: 0, penalizacion: 0.25 }).nota, 0);
  assert.equal(notaTest({ aciertos: 50, errores: 0, blancos: 0, penalizacion: 0.25 }).nota, 10);
});

test("sin preguntas no hay nota", () => {
  assert.equal(notaTest({ aciertos: 0, errores: 0, blancos: 0, penalizacion: 0.25 }).nota, null);
});

test("el coste de la oposición suma tasa, academia, material y viajes", () => {
  const r = costeOposicion({ tasa: 20, academiaMes: 50, meses: 10, material: 150, viajes: 2, costeViaje: 40 });
  assert.equal(r.total, 20 + 500 + 150 + 80);
  assert.equal(r.porMes, 75);
});

test("los campos vacíos cuentan como cero", () => {
  assert.equal(costeOposicion({ tasa: "", academiaMes: undefined, meses: 0, material: 30, viajes: 0, costeViaje: 0 }).total, 30);
});

test("el mensaje de sugerencia se prepara como enlace de correo bien codificado", () => {
  const url = construirMailto("contacto@ejemplo.es", { tipo: "Sugerir un recurso", oposicion: "Policía Nacional", mensaje: "Falta esta guía & más", enlace: "https://x.es/a?b=1" });
  assert.ok(url.startsWith("mailto:contacto@ejemplo.es?subject="));
  assert.ok(url.includes(encodeURIComponent("Falta esta guía & más")));
  assert.ok(url.includes(encodeURIComponent("https://x.es/a?b=1")));
});

test("sin dirección de contacto no hay enlace", () => {
  assert.equal(construirMailto("", { tipo: "x", oposicion: "", mensaje: "y", enlace: "" }), "");
});
