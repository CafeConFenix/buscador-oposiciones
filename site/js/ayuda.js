/** Prepara el correo con una sugerencia o un aviso de error. Sin dirección de contacto no hay formulario. */
export function construirMailto(contacto, { tipo, oposicion, mensaje, enlace }) {
  if (!contacto) return "";
  const cuerpo = [
    `Tipo: ${tipo}`,
    oposicion ? `Oposición: ${oposicion}` : "",
    enlace ? `Enlace: ${enlace}` : "",
    "",
    mensaje,
  ].filter((linea, i) => linea || i === 3).join("\n");
  return `mailto:${contacto}?subject=${encodeURIComponent(`Oposiciones de España: ${tipo}`)}&body=${encodeURIComponent(cuerpo)}`;
}
