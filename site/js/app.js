import { buscarOposiciones, buscarArticulos, dividirResaltado, convocatoriasDe, esConsultaDeArticulo } from "./busqueda.js";
import { construirEventos, agruparPorMes, filtrarEventos, formatearFecha, formatearDia } from "./calendario.js";
import { detectarRepo } from "./config.js";

const principal = document.getElementById("principal");
const REPO = detectarRepo();
const cacheNormas = new Map();

/* ---------- utilidades ---------- */

// Todo el contenido se construye con nodos de texto: los datos nunca se interpretan como HTML.
function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props)) {
    if (valor == null || valor === false) continue;
    if (clave === "class") el.className = valor;
    else if (clave.startsWith("on")) el.addEventListener(clave.slice(2), valor);
    else el.setAttribute(clave, valor === true ? "" : valor);
  }
  el.append(...hijos.flat().filter((x) => x != null && x !== false));
  return el;
}

function marcar(texto, consulta) {
  return dividirResaltado(texto, consulta).map((t) => (t.marca ? h("mark", {}, t.texto) : t.texto));
}

async function cargarJson(ruta, porDefecto) {
  try {
    const r = await fetch(ruta);
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return porDefecto;
  }
}

function leerHash() {
  const [ruta, resto = ""] = (location.hash.slice(1) || "/").split("?");
  return { ruta: ruta || "/", params: new URLSearchParams(resto) };
}

// La búsqueda queda en la dirección (compartible) sin recargar la vista ni llenar el historial.
function guardarParams(params) {
  const { ruta } = leerHash();
  const texto = params.toString();
  history.replaceState(null, "", `#${ruta}${texto ? "?" + texto : ""}`);
}

function fijarParam(params, clave, valor, vacio = "") {
  if (!valor || valor === vacio) params.delete(clave);
  else params.set(clave, valor);
  guardarParams(params);
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const restarDias = (iso, dias) => new Date(Date.parse(iso) - dias * 864e5).toISOString().slice(0, 10);

/* ---------- datos ---------- */

async function cargarDatos() {
  const [oposiciones, normas, convocatorias, examenes, estado] = await Promise.all([
    cargarJson("data/oposiciones.json", []),
    cargarJson("data/normas.json", []),
    cargarJson("data/convocatorias.json", []),
    cargarJson("data/examenes.json", []),
    cargarJson("data/estado.json", null),
  ]);
  return { oposiciones, normas, convocatorias, examenes, estado };
}

/* ---------- vista: oposiciones ---------- */

function vistaOposiciones(d, params) {
  let consulta = params.get("q") ?? "";
  let ambito = params.get("ambito") ?? "todas";

  const estado = h("p", { class: "estado", "aria-live": "polite" });
  const lista = h("ul", { class: "resultados" });
  const entrada = h("input", {
    id: "q", type: "search", name: "q", value: consulta, autocomplete: "off", spellcheck: "false",
    enterkeyhint: "search", placeholder: "Auxiliar administrativo, Policía Nacional, TCAE…",
    oninput: (e) => { consulta = e.target.value; fijarParam(params, "q", consulta.trim()); pintar(); },
  });

  const opcionesAmbito = [["todas", "Todas"], ["Estado", "Estado"], ["Autonómica", "Comunidades"], ["Local", "Ayuntamientos"]];
  const filtros = h("fieldset", { class: "filtros" },
    h("legend", {}, "Administración"),
    opcionesAmbito.flatMap(([valor, texto]) => [
      h("input", { type: "radio", name: "ambito", id: `ambito-${valor}`, value: valor, checked: valor === ambito,
        onchange: () => { ambito = valor; fijarParam(params, "ambito", valor, "todas"); pintar(); } }),
      h("label", { for: `ambito-${valor}` }, texto),
    ]),
  );

  function pintar() {
    const base = ambito === "todas" ? d.oposiciones : d.oposiciones.filter((o) => o.ambito === ambito);
    const encontradas = buscarOposiciones(base, consulta);
    const visibles = encontradas.slice(0, 60);
    lista.replaceChildren(...visibles.map((o) => filaOposicion(o, consulta, d, encontradas.length === 1)));
    if (!d.oposiciones.length) estado.textContent = "No se han podido cargar las oposiciones.";
    else if (!consulta.trim()) estado.textContent = `${encontradas.length} oposiciones en el catálogo. Escribe arriba para filtrar.`;
    else if (!encontradas.length) estado.textContent = `Ninguna oposición coincide con «${consulta.trim()}».`;
    else estado.textContent = `${encontradas.length} ${encontradas.length === 1 ? "resultado" : "resultados"} para «${consulta.trim()}».`;
    vacio.hidden = encontradas.length > 0 || !consulta.trim();
  }

  const vacio = h("div", { class: "aviso vacio", hidden: true },
    h("p", {}, "No está en el catálogo todavía. Esto no significa que no exista: el catálogo crece con aportaciones. "),
    enlaceSolicitud(),
  );

  principal.replaceChildren(
    h("h1", {}, "¿Qué oposición preparas?"),
    h("label", { class: "buscador", for: "q" },
      h("span", { class: "solo-lectores" }, "Buscar oposición"), entrada),
    filtros, estado, lista, vacio,
    h("h2", {}, "Normas que sirven para casi todas"),
    h("p", {}, "Búscalas artículo a artículo, con el texto consolidado del BOE."),
    h("div", { class: "troncales" },
      d.normas.slice(0, 8).map((n) => h("a", { href: `#/normas?norma=${n.slug}` }, nombreCorto(n.nombre)))),
  );
  pintar();
}

const nombreCorto = (nombre) => nombre.replace(/\s*\(.*\)$/, "").split(",")[0];

function filaOposicion(o, consulta, d, abrir) {
  const nombresNorma = new Map(d.normas.map((n) => [n.slug, n]));
  const anuncios = convocatoriasDe(o, d.convocatorias).slice(0, 5);
  const urlLibros = `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(`${o.nombre} temario oposiciones`)}`;

  return h("li", {},
    h("details", { open: abrir },
      h("summary", {},
        h("span", { class: "nombre" }, marcar(o.nombre, consulta)),
        h("span", { class: "meta" },
          o.grupo ? h("span", { class: "grupo", title: `Grupo ${o.grupo}` }, o.grupo) : null,
          h("span", {}, ambitoTexto(o.ambito)),
          h("span", {}, o.area)),
      ),
      h("div", { class: "detalle" },
        h("h3", {}, "Convocatorias recientes en el BOE"),
        anuncios.length
          ? h("ul", {}, anuncios.map((c) => h("li", {}, h("span", { class: "fecha" }, formatearFecha(c.fecha)), h("a", { href: c.url_html || c.url_pdf, rel: "noopener" }, resumirTitulo(c.titulo)))))
          : h("p", { class: "nota" }, o.boe?.length
              ? "Aún no hay anuncios recientes de este cuerpo en los datos descargados."
              : "Estas convocatorias las publica cada comunidad, ayuntamiento o entidad en su boletín oficial. Consulta los enlaces oficiales."),
        h("p", { class: "nota" }, h("a", { href: "#/calendario" }, "Ver el calendario completo")),

        h("h3", {}, "Normas habituales"),
        h("p", { class: "nota" }, "Punto de partida general: el temario oficial es el que figura en las bases de tu convocatoria."),
        h("ul", {}, (o.normas ?? []).filter((s) => nombresNorma.has(s)).map((s) =>
          h("li", {}, h("a", { href: `#/normas?norma=${s}` }, nombresNorma.get(s).nombre)))),

        h("h3", {}, "Enlaces oficiales"),
        h("ul", {}, (o.enlaces ?? []).map((e) => h("li", {}, h("a", { href: e.url, rel: "noopener" }, e.titulo)))),

        h("h3", {}, "Libros y apuntes"),
        (o.recursos ?? []).length
          ? h("ul", {}, o.recursos.map((r) => h("li", {}, h("a", { href: r.url, rel: "noopener" }, r.titulo), r.tipo ? ` (${r.tipo}${r.gratuito ? ", gratis" : ""})` : "")))
          : h("p", { class: "nota" }, "Todavía nadie ha aportado recursos para este cuerpo."),
        h("ul", {},
          h("li", {}, h("a", { href: urlLibros, rel: "noopener" }, "Buscar libros del temario")),
          h("li", {}, h("a", { href: "https://www.boe.es/biblioteca_juridica/", rel: "noopener" }, "Códigos legales gratuitos del BOE")),
          REPO ? h("li", {}, h("a", { href: urlAportacion(o), rel: "noopener" }, "Aportar un libro, unos apuntes o una web")) : null),
      ),
    ),
  );
}

const ambitoTexto = (a) => ({ Estado: "Estado", Autonómica: "Comunidades autónomas", Local: "Administración local" }[a] ?? a);
const resumirTitulo = (t) => (t.length > 150 ? t.slice(0, 150).replace(/\s+\S*$/, "") + "…" : t);

function urlAportacion(o) {
  const cuerpo = "Tipo (libro, apuntes, web, vídeo):\nTítulo:\nEnlace:\nGratuito (sí/no):\nComentario:";
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent("Recurso para " + o.nombre)}&body=${encodeURIComponent(cuerpo)}`;
}

function enlaceSolicitud() {
  return REPO
    ? h("a", { href: `https://github.com/${REPO}/issues/new?title=${encodeURIComponent("Añadir oposición")}`, rel: "noopener" }, "Pide que la añadan")
    : h("span", {}, "Puedes pedir que la añadan en el repositorio del proyecto.");
}

/* ---------- vista: normas ---------- */

async function cargarNorma(entrada) {
  if (!cacheNormas.has(entrada.id)) {
    cacheNormas.set(entrada.id, await cargarJson(`data/normas/${entrada.id}.json`, null));
  }
  return cacheNormas.get(entrada.id);
}

function vistaNormas(d, params) {
  let slug = params.get("norma") ?? d.normas[0]?.slug;
  let consulta = params.get("q") ?? "";

  const estado = h("p", { class: "estado", "aria-live": "polite" });
  const resultados = h("ul", { class: "resultados" });
  const cabeceraNorma = h("p", { class: "cuenta-norma" });

  const selector = h("select", {
    id: "norma", name: "norma",
    onchange: (e) => { slug = e.target.value; fijarParam(params, "norma", slug); pintar(); },
  }, d.normas.map((n) => h("option", { value: n.slug, selected: n.slug === slug }, n.nombre)));

  const entrada = h("input", {
    id: "qn", type: "search", name: "q", value: consulta, autocomplete: "off", spellcheck: "false", enterkeyhint: "search",
    placeholder: "Un artículo (art 14) o palabras (igualdad, plazos…)",
    oninput: (e) => { consulta = e.target.value; fijarParam(params, "q", consulta.trim()); pintar(); },
  });

  async function pintar() {
    const entradaNorma = d.normas.find((n) => n.slug === slug) ?? d.normas[0];
    if (!entradaNorma) { estado.textContent = "No hay normas disponibles."; return; }
    const urlBoe = `https://www.boe.es/buscar/act.php?id=${entradaNorma.id}`;
    estado.textContent = "Cargando…";
    const norma = await cargarNorma(entradaNorma);
    if (entradaNorma.slug !== slug && slug) return; // el usuario cambió de norma mientras cargaba

    cabeceraNorma.replaceChildren("Texto consolidado del BOE, informativo y sin valor jurídico. ",
      h("a", { href: urlBoe, rel: "noopener" }, "Abrir en el BOE"));

    if (!norma) {
      resultados.replaceChildren();
      estado.replaceChildren("El texto de esta norma todavía no se ha descargado en la web (se actualiza solo cada día). Mientras tanto, ",
        h("a", { href: urlBoe, rel: "noopener" }, "léela en el BOE"), ".");
      return;
    }

    if (!consulta.trim()) {
      const primeros = norma.articulos.slice(0, 30);
      resultados.replaceChildren(...primeros.map((a) => filaArticulo(a, "", "", false)));
      estado.textContent = `${norma.articulos.length} apartados. Escribe un número de artículo o unas palabras para encontrarlo; abajo se muestran los primeros ${primeros.length}.`;
      return;
    }
    const encontrados = buscarArticulos(norma, consulta);
    resultados.replaceChildren(...encontrados.map((r) => filaArticulo(r.articulo, consulta, r.fragmento, encontrados.length === 1)));
    estado.textContent = encontrados.length
      ? `${encontrados.length} ${encontrados.length === 1 ? "artículo" : "artículos"} para «${consulta.trim()}».`
      : `Nada para «${consulta.trim()}» en esta norma.`;
  }

  principal.replaceChildren(
    h("h1", {}, "Normas y documentos troncales"),
    h("div", { class: "campo" }, h("label", { for: "norma" }, h("span", {}, "Norma")), selector),
    h("div", { class: "campo" }, h("label", { for: "qn" }, h("span", {}, "Buscar dentro de la norma")), entrada),
    cabeceraNorma, estado, resultados,
  );
  pintar();
}

function filaArticulo(articulo, consultaOriginal, fragmento, abrir) {
  const consulta = esConsultaDeArticulo(consultaOriginal) ? "" : consultaOriginal;
  const [primero, ...resto] = articulo.parrafos;
  return h("li", { id: articulo.id },
    h("details", { open: abrir },
      h("summary", {}, h("span", { class: "nombre" }, marcar(articulo.titulo, consulta)),
        fragmento && !abrir ? h("p", { class: "fragmento" }, marcar(fragmento, consulta)) : null),
      h("div", { class: "detalle articulo-texto" },
        h("p", {}, marcar(primero ?? "", consulta)), resto.map((p) => h("p", {}, marcar(p, consulta)))),
    ),
  );
}

/* ---------- vista: calendario ---------- */

function vistaCalendario(d, params) {
  let tipo = params.get("tipo") ?? "todos";
  let texto = params.get("q") ?? "";
  let antiguos = params.get("antiguos") === "1";

  const estado = h("p", { class: "estado", "aria-live": "polite" });
  const contenedor = h("div", {});
  const entrada = h("input", {
    id: "qc", type: "search", name: "q", value: texto, autocomplete: "off", spellcheck: "false", enterkeyhint: "search",
    placeholder: "Filtrar por cuerpo, ministerio o comunidad",
    oninput: (e) => { texto = e.target.value; fijarParam(params, "q", texto.trim()); pintar(); },
  });
  const tipos = [["todos", "Todo"], ["examen", "Exámenes"], ["convocatoria", "Convocatorias"]];
  const filtros = h("fieldset", { class: "filtros" },
    h("legend", {}, "Mostrar"),
    tipos.flatMap(([valor, etiqueta]) => [
      h("input", { type: "radio", name: "tipo", id: `tipo-${valor}`, value: valor, checked: valor === tipo,
        onchange: () => { tipo = valor; fijarParam(params, "tipo", valor, "todos"); pintar(); } }),
      h("label", { for: `tipo-${valor}` }, etiqueta),
    ]),
  );
  const casilla = h("label", { class: "casilla" },
    h("input", { type: "checkbox", checked: antiguos,
      onchange: (e) => { antiguos = e.target.checked; fijarParam(params, "antiguos", antiguos ? "1" : ""); pintar(); } }),
    "Incluir fechas de hace más de un mes");

  const todos = construirEventos(d.convocatorias, d.examenes);

  function pintar() {
    const desde = antiguos ? "" : restarDias(hoyISO(), 30);
    const eventos = filtrarEventos(todos, { tipo, texto, desde });
    const meses = agruparPorMes(eventos);
    contenedor.replaceChildren(...meses.map((mes) =>
      h("section", { class: "mes" },
        h("h2", {}, mes.etiqueta),
        h("ol", {}, mes.eventos.map((e) => h("li", { class: `evento ${e.tipo}` },
          h("time", { datetime: e.fecha, title: formatearFecha(e.fecha) }, formatearDia(e.fecha)),
          h("div", {},
            h("p", { class: "titulo" }, h("span", { class: "tipo" }, e.tipo === "examen" ? "Examen" : "Convocatoria"), marcar(resumirTitulo(e.titulo), texto)),
            h("p", { class: "organismo" }, [e.organismo, e.fuente ? `Fuente: ${e.fuente}` : ""].filter(Boolean).join(". ")),
            e.url ? h("a", { href: e.url, rel: "noopener" }, "Ver el anuncio oficial") : null))))),
    ));
    if (eventos.length) estado.textContent = `${eventos.length} ${eventos.length === 1 ? "fecha" : "fechas"}.`;
    else if (!todos.length) estado.textContent = "Todavía no hay fechas cargadas. Se añaden solas cada día desde el BOE; si acabas de publicar la web, lanza la actualización desde GitHub (Actions).";
    else estado.textContent = "No hay fechas con esos filtros.";
  }

  const urlIcs = new URL("data/examenes.ics", location.href);
  principal.replaceChildren(
    h("h1", {}, "Calendario de convocatorias y exámenes"),
    h("p", {}, "Las convocatorias del Estado salen del BOE cada día. Las fechas de examen se leen de los anuncios oficiales de admitidos y de las aportaciones del proyecto."),
    h("p", { class: "suscripcion" }, "Suscríbete desde tu calendario: ",
      h("a", { href: urlIcs.href.replace(/^https?:/, "webcal:") }, "añadir exámenes a mi calendario"), "."),
    h("div", { class: "campo" }, h("label", { for: "qc" }, h("span", {}, "Buscar")), entrada),
    filtros, casilla, estado, contenedor,
    h("p", { class: "aviso" }, "Cada comunidad, ayuntamiento y universidad publica en su propio boletín. Esas fechas se incorporan con aportaciones al archivo data/examenes.json."),
  );
  pintar();
}

/* ---------- arranque ---------- */

let datos = null;

async function pintarRuta() {
  const { ruta, params } = leerHash();
  for (const a of document.querySelectorAll(".cabecera nav a")) {
    if (a.dataset.ruta === ruta) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const vista = { "/": vistaOposiciones, "/normas": vistaNormas, "/calendario": vistaCalendario }[ruta] ?? vistaOposiciones;
  document.title = {
    "/normas": "Normas y documentos troncales | Oposiciones de España",
    "/calendario": "Calendario de oposiciones | Oposiciones de España",
  }[ruta] ?? "Oposiciones de España: temarios, normas y calendario";
  vista(datos, params);
}

async function iniciar() {
  datos = await cargarDatos();
  if (datos.estado?.actualizado) {
    document.getElementById("pie-datos").textContent =
      `Datos del BOE actualizados el ${formatearFecha(datos.estado.actualizado.slice(0, 10))}. Fuente: Agencia Estatal Boletín Oficial del Estado.`;
  }
  await pintarRuta();
  window.addEventListener("hashchange", () => { pintarRuta(); window.scrollTo(0, 0); });
}

iniciar();
