/** Calculadoras para opositores: nota de un test con penalización y coste total de la preparación. */

const numero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const redondear = (n) => Math.round(n * 100) / 100;

export function notaTest({ aciertos, errores, blancos, penalizacion = 1 / 3 }) {
  const a = numero(aciertos), e = numero(errores), b = numero(blancos);
  const preguntas = a + e + b;
  const puntos = redondear(a - e * numero(penalizacion));
  if (!preguntas) return { preguntas: 0, puntos: 0, nota: null };
  const nota = Math.min(10, Math.max(0, redondear((puntos / preguntas) * 10)));
  return { preguntas, puntos, nota };
}

export function costeOposicion({ tasa, academiaMes, meses, material, viajes, costeViaje }) {
  const academia = numero(academiaMes) * numero(meses);
  const total = numero(tasa) + academia + numero(material) + numero(viajes) * numero(costeViaje);
  const m = numero(meses);
  return { total: redondear(total), porMes: m ? redondear(total / m) : null };
}
