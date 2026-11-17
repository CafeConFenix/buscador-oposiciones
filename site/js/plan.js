/** Plan de estudio: reparte los temas por semanas hasta el examen y reserva las últimas para repasar. */

const DIA = 86_400_000;
const aMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const aIso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Días naturales desde `hoy` hasta `fecha` (negativo si ya pasó). */
export function diasHasta(fecha, hoy) {
  return Math.round((aMs(fecha) - aMs(hoy)) / DIA);
}

export function planificarEstudio({ totalTemas, hoy, examen, repaso = 0.25 }) {
  const semanasTotales = Math.floor(diasHasta(examen, hoy) / 7);
  if (semanasTotales < 1 || totalTemas < 1) {
    return { semanas: [], aviso: "Falta menos de una semana para el examen: dedícala a repasar lo que ya sabes." };
  }
  const reservadas = totalTemas >= 4 ? Math.max(1, Math.round(semanasTotales * repaso)) : 0;
  const semanasEstudio = Math.min(Math.max(semanasTotales - reservadas, 1), totalTemas);
  const semanas = [];
  for (let i = 0; i < semanasTotales; i++) {
    const desde = aMs(hoy) + i * 7 * DIA;
    const base = { semana: i + 1, desde: aIso(desde), hasta: aIso(desde + 6 * DIA) };
    if (i < semanasEstudio) {
      const primero = Math.floor((i * totalTemas) / semanasEstudio) + 1;
      const ultimo = Math.floor(((i + 1) * totalTemas) / semanasEstudio);
      semanas.push({ ...base, tipo: "estudio", temas: [primero, ultimo] });
    } else {
      semanas.push({ ...base, tipo: "repaso", temas: null });
    }
  }
  return { semanas, aviso: "" };
}
