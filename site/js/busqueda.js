// Lógica de búsqueda sin dependencias: se usa en el navegador y en los tests (node --test).

const quitarMarcas = (c) => c.normalize("NFD").replace(/\p{M}/gu, "");

/** Minúsculas, sin tildes ni signos, con espacios simples. */
export function normalizar(texto) {
  return quitarMarcas(String(texto ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const palabras = (texto) => normalizar(texto).split(" ").filter(Boolean);
const empiezaPorAlguna = (lista, token) => lista.some((p) => p.startsWith(token));

/** Oposiciones que contienen todas las palabras buscadas (por prefijo), de más a menos relevantes. */
export function buscarOposiciones(oposiciones, consulta) {
  const q = normalizar(consulta);
  const tokens = q.split(" ").filter(Boolean);
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
  if (!tokens.length) return [...oposiciones].sort(porNombre);

  const resultados = [];
  for (const op of oposiciones) {
    const titulos = [op.nombre, ...(op.aliases ?? [])];
    const enTitulos = titulos.flatMap(palabras);
    const enContexto = [...palabras(op.area), ...palabras(op.ambito)];
    if (!tokens.every((t) => empiezaPorAlguna(enTitulos, t) || empiezaPorAlguna(enContexto, t))) continue;

    let puntos = 0;
    for (const t of titulos.map(normalizar)) {
      if (t === q) puntos += 100;
      else if (t.startsWith(q)) puntos += 40;
    }
    for (const t of tokens) {
      puntos += empiezaPorAlguna(enTitulos, t) ? 10 : 2;
    }
    resultados.push({ op, puntos });
  }
  return resultados
    .sort((a, b) => b.puntos - a.puntos || porNombre(a.op, b.op))
    .map((r) => r.op);
}

const NUMERO_ARTICULO = /^(?:art(?:iculo)?\s*)?(\d+)(?:\s*(bis|ter|quater))?$/;

/** True si la consulta es solo un número de artículo ("14", "art 14", "artículo 14 bis"). */
export function esConsultaDeArticulo(consulta) {
  return NUMERO_ARTICULO.test(normalizar(consulta));
}

/** Artículos de una norma: "art 14" va directo al 14; el resto es búsqueda de texto. */
export function buscarArticulos(norma, consulta, maximo = 50) {
  const q = normalizar(consulta);
  if (!q) return [];
  const directo = q.match(NUMERO_ARTICULO);
  if (directo) {
    const objetivo = `articulo ${directo[1]}${directo[2] ? " " + directo[2] : ""}`;
    const exacto = norma.articulos.filter((a) => normalizar(a.titulo) === objetivo);
    if (exacto.length) return exacto.map((articulo) => ({ articulo, fragmento: resumen(articulo.parrafos.slice(1)) }));
  }
  const tokens = q.split(" ");
  const resultados = [];
  for (const articulo of norma.articulos) {
    const cuerpo = palabras(articulo.parrafos.join(" "));
    const titulo = palabras(articulo.titulo);
    if (!tokens.every((t) => empiezaPorAlguna(cuerpo, t) || empiezaPorAlguna(titulo, t))) continue;
    let puntos = 0;
    for (const t of tokens) puntos += cuerpo.filter((p) => p.startsWith(t)).length + (empiezaPorAlguna(titulo, t) ? 3 : 0);
    resultados.push({ articulo, puntos, fragmento: fragmentoCon(articulo, tokens) });
  }
  return resultados
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, maximo)
    .map(({ articulo, fragmento }) => ({ articulo, fragmento }));
}

function fragmentoCon(articulo, tokens) {
  const parrafo = articulo.parrafos.find((p) => tokens.some((t) => empiezaPorAlguna(palabras(p), t)));
  return resumen([parrafo ?? articulo.parrafos[1] ?? ""]);
}

const resumen = (parrafos, largo = 260) => {
  const texto = (parrafos[0] ?? "").trim();
  return texto.length > largo ? texto.slice(0, largo).replace(/\s+\S*$/, "") + "…" : texto;
};

/** Parte un texto en trozos marcados / no marcados, ignorando tildes y mayúsculas. */
export function dividirResaltado(texto, consulta) {
  const tokens = normalizar(consulta).split(" ").filter(Boolean);
  if (!tokens.length) return [{ texto, marca: false }];
  // Mapa 1:1 entre caracteres originales y normalizados, para conservar las posiciones.
  const plano = Array.from(texto, (c) => {
    const n = quitarMarcas(c).toLowerCase();
    return n.length === 1 ? n : " ";
  }).join("");
  const marcado = new Array(texto.length).fill(false);
  for (const t of tokens) {
    for (let i = plano.indexOf(t); i !== -1; i = plano.indexOf(t, i + 1)) marcado.fill(true, i, i + t.length);
  }
  const trozos = [];
  for (let i = 0; i < texto.length; i++) {
    const ultimo = trozos[trozos.length - 1];
    if (ultimo && ultimo.marca === marcado[i]) ultimo.texto += texto[i];
    else trozos.push({ texto: texto[i], marca: marcado[i] });
  }
  return trozos;
}

/** Anuncios del BOE cuyo título contiene alguna de las palabras clave de la oposición. */
export function convocatoriasDe(oposicion, convocatorias) {
  const claves = (oposicion.boe ?? []).map(normalizar).filter(Boolean);
  if (!claves.length) return [];
  return convocatorias.filter((c) => claves.some((k) => normalizar(c.titulo).includes(k)));
}
