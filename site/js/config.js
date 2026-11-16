// Si la web está en GitHub Pages (usuario.github.io/repositorio) se deduce el repositorio solo.
// Si usas un dominio propio, escribe aquí "usuario/repositorio".
const MANUAL = "";

export function detectarRepo(ubicacion = globalThis.location) {
  if (MANUAL) return MANUAL;
  if (!ubicacion || !ubicacion.hostname.endsWith(".github.io")) return "";
  const usuario = ubicacion.hostname.split(".")[0];
  const repo = ubicacion.pathname.split("/")[1] || `${usuario}.github.io`;
  return `${usuario}/${repo}`;
}
