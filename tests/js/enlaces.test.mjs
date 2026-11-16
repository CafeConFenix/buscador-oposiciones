import test from "node:test";
import assert from "node:assert/strict";
import { urlPdfBoe, enlacesApuntes, comunidadDe, convocatoriasDeComunidad } from "../../site/js/busqueda.js";

test("el PDF consolidado oficial se construye con el año del identificador", () => {
  assert.equal(urlPdfBoe("BOE-A-1978-31229"), "https://www.boe.es/buscar/pdf/1978/BOE-A-1978-31229-consolidado.pdf");
  assert.equal(urlPdfBoe("BOE-A-1889-4763"), "https://www.boe.es/buscar/pdf/1889/BOE-A-1889-4763-consolidado.pdf");
});

test("un identificador raro no genera un enlace roto", () => {
  assert.equal(urlPdfBoe("xx"), "");
});

test("los apuntes de un tema llevan el título y la oposición codificados", () => {
  const e = enlacesApuntes("La Corona. Las Cortes Generales.", "Auxiliar Administrativo");
  assert.equal(e.length, 3);
  assert.ok(e[0].url.includes("filetype%3Apdf"));
  assert.ok(e.every((x) => x.url.startsWith("https://") && x.texto));
  assert.ok(e[0].url.includes(encodeURIComponent("La Corona. Las Cortes Generales")));
});

test("reconoce la comunidad por el organismo o por el título, sin importar tildes", () => {
  assert.equal(comunidadDe({ organismo: "COMUNIDAD DE MADRID", titulo: "x" }), "madrid");
  assert.equal(comunidadDe({ organismo: "Otros", titulo: "Resolución de la Junta de Castilla y León por la que" }), "castilla-y-leon");
  assert.equal(comunidadDe({ organismo: "Comunitat Valenciana", titulo: "x" }), "comunidad-valenciana");
  assert.equal(comunidadDe({ organismo: "Ministerio de Justicia", titulo: "Cuerpo de Letrados" }), null);
});

test("Castilla-La Mancha no se confunde con Castilla y León", () => {
  assert.equal(comunidadDe({ organismo: "Castilla-La Mancha", titulo: "x" }), "castilla-la-mancha");
});

test("filtra y ordena las convocatorias de una comunidad, las más recientes primero", () => {
  const conv = [
    { id: "a", fecha: "2026-01-01", organismo: "Comunidad de Madrid", titulo: "t" },
    { id: "b", fecha: "2026-03-01", organismo: "Comunidad de Madrid", titulo: "t" },
    { id: "c", fecha: "2026-02-01", organismo: "Galicia", titulo: "t" },
  ];
  assert.deepEqual(convocatoriasDeComunidad("madrid", conv).map((c) => c.id), ["b", "a"]);
});
