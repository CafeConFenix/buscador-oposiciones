import test from "node:test";
import assert from "node:assert/strict";
import { construirMailto, contactoValido } from "../../site/js/ayuda.js";

test("un correo real es un contacto válido", () => {
  assert.equal(contactoValido("persona@dominio.es"), true);
});

test("el marcador, el vacío y lo que no es un correo no activan las sugerencias", () => {
  for (const c of ["", undefined, "PON-AQUI-TU-EMAIL@ejemplo.es", "sin-arroba", "a@b"]) assert.equal(contactoValido(c), false, String(c));
});

test("sin contacto válido no se prepara ningún enlace", () => {
  assert.equal(construirMailto("PON-AQUI-TU-EMAIL@ejemplo.es", { tipo: "Avisar de un error", mensaje: "hola" }), "");
});

test("con contacto válido se prepara el correo con el mensaje", () => {
  const url = construirMailto("persona@dominio.es", { tipo: "Avisar de un error", oposicion: "TCAE", mensaje: "hola" });
  assert.match(url, /^mailto:persona@dominio\.es\?subject=/);
  assert.match(decodeURIComponent(url), /Oposición: TCAE/);
});
