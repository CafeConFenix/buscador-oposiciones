import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizar, buscarOposiciones, buscarArticulos, dividirResaltado, convocatoriasDe,
} from "../../site/js/busqueda.js";

const oposiciones = [
  { id: "age-administrativo", nombre: "Cuerpo General Administrativo de la Administración del Estado",
    aliases: ["Administrativo del Estado", "C1 AGE"], area: "Administración General del Estado", ambito: "Estado",
    boe: ["Cuerpo General Administrativo"] },
  { id: "age-auxiliar", nombre: "Cuerpo General Auxiliar de la Administración del Estado",
    aliases: ["Auxiliar Administrativo del Estado", "Auxiliar AGE"], area: "Administración General del Estado", ambito: "Estado",
    boe: ["Cuerpo General Auxiliar"] },
  { id: "guardia-civil", nombre: "Guardia Civil (Escala de Cabos y Guardias)", aliases: ["Guardia Civil", "Benemérita"],
    area: "Seguridad", ambito: "Estado", boe: ["Guardia Civil"] },
  { id: "tcae", nombre: "Técnico en Cuidados Auxiliares de Enfermería", aliases: ["TCAE", "Auxiliar de Enfermería"],
    area: "Sanidad", ambito: "Autonómica", boe: [] },
];

test("normalizar quita tildes, mayúsculas y signos", () => {
  assert.equal(normalizar("  Administración   del ESTADO! "), "administracion del estado");
  assert.equal(normalizar("Ñandú"), "nandu");
});

test("busca sin importar tildes ni mayúsculas", () => {
  const r = buscarOposiciones(oposiciones, "BENEMERITA");
  assert.deepEqual(r.map((x) => x.id), ["guardia-civil"]);
});

test("todas las palabras de la búsqueda deben aparecer", () => {
  const r = buscarOposiciones(oposiciones, "auxiliar estado");
  assert.deepEqual(r.map((x) => x.id), ["age-auxiliar"]);
});

test("acepta siglas y alias", () => {
  assert.equal(buscarOposiciones(oposiciones, "tcae")[0].id, "tcae");
});

test("un alias exacto va antes que una coincidencia suelta", () => {
  const lista = [
    { id: "suelta", nombre: "Cuerpo de Gestión de Empleo y Auxiliares", aliases: [], area: "", ambito: "", boe: [] },
    { id: "exacta", nombre: "Otro cuerpo", aliases: ["Auxiliar"], area: "", ambito: "", boe: [] },
  ];
  assert.deepEqual(buscarOposiciones(lista, "auxiliar").map((x) => x.id), ["exacta", "suelta"]);
});

test("'auxiliar' encuentra el auxiliar del Estado y el TCAE, no el administrativo", () => {
  const ids = buscarOposiciones(oposiciones, "auxiliar").map((x) => x.id).sort();
  assert.deepEqual(ids, ["age-auxiliar", "tcae"]);
});

test("sin consulta devuelve todo ordenado por nombre", () => {
  const r = buscarOposiciones(oposiciones, "");
  assert.equal(r.length, 4);
  assert.equal(r[0].id, "age-administrativo");
});

test("coincidencia por prefijo mientras se escribe", () => {
  assert.deepEqual(buscarOposiciones(oposiciones, "guar").map((x) => x.id), ["guardia-civil"]);
});

const norma = {
  id: "BOE-A-1978-31229", titulo: "Constitución Española.",
  articulos: [
    { id: "a14", titulo: "Artículo 14", parrafos: ["Artículo 14.", "Los españoles son iguales ante la ley, sin que pueda prevalecer discriminación alguna."] },
    { id: "a140", titulo: "Artículo 140", parrafos: ["Artículo 140.", "La Constitución garantiza la autonomía de los municipios."] },
    { id: "a9", titulo: "Artículo 9", parrafos: ["Artículo 9.", "Los ciudadanos y los poderes públicos están sujetos a la Constitución. La igualdad ante la ley..."] },
  ],
};

test("'art 14', 'artículo 14' y '14' llevan directo al artículo 14", () => {
  for (const q of ["14", "art 14", "art. 14", "Artículo 14"]) {
    assert.equal(buscarArticulos(norma, q)[0].articulo.id, "a14", q);
  }
});

test("el número exacto no mezcla el 140", () => {
  assert.deepEqual(buscarArticulos(norma, "art 14").map((r) => r.articulo.id), ["a14"]);
});

test("búsqueda de texto: palabras sin tildes y ordenadas por relevancia", () => {
  const r = buscarArticulos(norma, "igualdad ley");
  assert.equal(r[0].articulo.id, "a9");
  const r2 = buscarArticulos(norma, "autonomia municipios");
  assert.deepEqual(r2.map((x) => x.articulo.id), ["a140"]);
});

test("dividirResaltado marca coincidencias ignorando tildes", () => {
  const trozos = dividirResaltado("La Administración del Estado", "administracion");
  assert.deepEqual(trozos, [
    { texto: "La ", marca: false },
    { texto: "Administración", marca: true },
    { texto: " del Estado", marca: false },
  ]);
});

test("dividirResaltado sin consulta devuelve el texto sin marcar", () => {
  assert.deepEqual(dividirResaltado("hola", ""), [{ texto: "hola", marca: false }]);
});

test("convocatorias del BOE enlazadas a una oposición por palabras clave", () => {
  const convs = [
    { id: "1", titulo: "Resolución por la que se convoca proceso selectivo en el Cuerpo General Administrativo de la Administración del Estado" },
    { id: "2", titulo: "Resolución por la que se convoca proceso selectivo en el Cuerpo General Auxiliar de la Administración del Estado" },
  ];
  assert.deepEqual(convocatoriasDe(oposiciones[0], convs).map((c) => c.id), ["1"]);
  assert.deepEqual(convocatoriasDe(oposiciones[3], convs), []);
});

test("reconoce cuándo la consulta es un número de artículo", async () => {
  const { esConsultaDeArticulo } = await import("../../site/js/busqueda.js");
  for (const q of ["14", "art 14", "Art. 14 bis", "artículo 135"]) assert.equal(esConsultaDeArticulo(q), true, q);
  for (const q of ["igualdad", "art", "ley 39", "14 plazos"]) assert.equal(esConsultaDeArticulo(q), false, q);
});
