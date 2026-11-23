/** Prepara el correo con una sugerencia o un aviso de error. Sin dirección de contacto no hay formulario. */
/** Un correo de verdad: el marcador de ejemplo del archivo de configuración no cuenta. */
export function contactoValido(contacto) {
  const c = String(contacto ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) && !/^pon-aqui/i.test(c);
}

export function construirMailto(contacto, { tipo, oposicion, mensaje, enlace }) {
  if (!contactoValido(contacto)) return "";
  const cuerpo = [
    `Tipo: ${tipo}`,
    oposicion ? `Oposición: ${oposicion}` : "",
    enlace ? `Enlace: ${enlace}` : "",
    "",
    mensaje,
  ].filter((linea, i) => linea || i === 3).join("\n");
  return `mailto:${contacto}?subject=${encodeURIComponent(`Oposiciones de España: ${tipo}`)}&body=${encodeURIComponent(cuerpo)}`;
}
