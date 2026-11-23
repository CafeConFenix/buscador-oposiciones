import { buscarOposiciones, buscarArticulos, dividirResaltado, convocatoriasDe, esConsultaDeArticulo, urlPdfBoe, enlacesApuntes, convocatoriasDeComunidad, repararTexto } from "./busqueda.js";
import { planificarEstudio, diasHasta } from "./plan.js";
import { notaTest, costeOposicion } from "./calculadoras.js";
import { construirMailto, contactoValido } from "./ayuda.js";
import { construirEventos, agruparPorMes, filtrarEventos, formatearFecha, formatearDia } from "./calendario.js";

const principal = document.getElementById("principal");
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

// Estructura común: una banda de color arriba (título y buscador) y el contenido debajo.
function pagina(banda, cuerpo, { clase = "", estilo = "" } = {}) {
  principal.replaceChildren(
    h("div", { class: "banda", style: estilo || null }, h("div", { class: "interior" }, ...banda.filter(Boolean))),
    h("div", { class: `interior cuerpo ${clase}`.trim(), style: estilo || null }, ...cuerpo.filter(Boolean)),
  );
}

// Cada área tiene su color de subrayador, igual en toda la web.
const COLORES_AREA = {
  "Administración General del Estado": 0, "Educación": 1, "Defensa": 2, "Administración Autonómica": 3,
  "Administración Local": 4, "Correos": 5, "Hacienda": 6, "Justicia": 7, "Sanidad": 8, "Seguridad": 9, "Seguridad Social": 10,
};
const colorDe = (area = "") =>
  `--c: var(--s${COLORES_AREA[area] ?? ([...area].reduce((n, c) => n + c.charCodeAt(0), 0) % 11)})`;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const restarDias = (iso, dias) => new Date(Date.parse(iso) - dias * 864e5).toISOString().slice(0, 10);

/* ---------- datos ---------- */

async function cargarDatos() {
  const [oposiciones, normas, convocatoriasBoe, examenes, estado, recursos, enlacesEstado, cambios, autonomicas, config] = await Promise.all([
    cargarJson("data/oposiciones.json", []),
    cargarJson("data/normas.json", []),
    cargarJson("data/convocatorias.json", []),
    cargarJson("data/examenes.json", []),
    cargarJson("data/estado.json", null),
    cargarJson("data/recursos.json", { comunidades: [], estado: [], academias: [] }),
    cargarJson("data/enlaces_estado.json", {}),
    cargarJson("data/cambios.json", []),
    cargarJson("data/convocatorias_ccaa.json", []),
    cargarJson("data/config.json", { contacto: "" }),
  ]);
  const convocatorias = [...convocatoriasBoe, ...autonomicas.map((a) => ({ ...a, titulo: repararTexto(a.titulo) }))];
  return { oposiciones, normas, convocatorias, examenes, estado, recursos, enlacesEstado, cambios, config };
}

// Un enlace solo se oculta si la comprobación diaria lo dio por caído; sin dato, se muestra.
const enlaceVivo = (d, url) => d.enlacesEstado?.[url] !== false;

// Preferencias del lector en su navegador; si no hay almacenamiento, la web funciona igual.
const guardado = {
  leer(clave, defecto) { try { return JSON.parse(localStorage.getItem(clave)) ?? defecto; } catch { return defecto; } },
  escribir(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ } },
};

/* ---------- vista: oposiciones ---------- */

function vistaOposiciones(d, params) {
  let consulta = params.get("q") ?? "";
  let ambito = params.get("ambito") ?? "todas";
  let area = params.get("area") ?? "";

  const estado = h("p", { class: "estado", "aria-live": "polite" });
  const lista = h("ul", { class: "resultados" });
  const listaAreas = h("div", { class: "areas-lista", role: "group", "aria-label": "Filtrar por área" });
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

  const areas = [...new Set(d.oposiciones.map((o) => o.area))].sort((a, b) => a.localeCompare(b, "es"));
  const deAmbito = () => (ambito === "todas" ? d.oposiciones : d.oposiciones.filter((o) => o.ambito === ambito));

  function botonArea(valor, texto, n) {
    return h("button", {
      type: "button", class: "area", style: valor ? colorDe(valor) : "--c: var(--s0)", "aria-pressed": String(area === valor),
      onclick: () => { area = valor; fijarParam(params, "area", valor); pintar(); },
    }, h("span", { class: "trazo", "aria-hidden": "true" }), h("span", { class: "area-nombre" }, texto), h("span", { class: "area-n" }, String(n)));
  }

  function pintarAreas(base) {
    const cuenta = (a) => base.filter((o) => o.area === a).length;
    if (area && !cuenta(area)) { area = ""; fijarParam(params, "area", ""); }
    listaAreas.replaceChildren(botonArea("", "Todas las áreas", base.length),
      ...areas.filter((a) => cuenta(a) > 0).map((a) => botonArea(a, a, cuenta(a))));
  }

  function pintar() {
    const base = deAmbito();
    pintarAreas(base);
    const encontradas = buscarOposiciones(area ? base.filter((o) => o.area === area) : base, consulta);
    const visibles = encontradas.slice(0, 60);
    lista.replaceChildren(...visibles.map((o) => filaOposicion(o, consulta, d, encontradas.length === 1)));
    const donde = area ? ` en ${area}` : "";
    if (!d.oposiciones.length) estado.textContent = "No se han podido cargar las oposiciones.";
    else if (!consulta.trim()) estado.textContent = `${encontradas.length} oposiciones${donde}.`;
    else if (!encontradas.length) estado.textContent = `Ninguna oposición coincide con «${consulta.trim()}»${donde}.`;
    else estado.textContent = `${encontradas.length} ${encontradas.length === 1 ? "resultado" : "resultados"} para «${consulta.trim()}»${donde}.`;
    vacio.hidden = encontradas.length > 0 || !consulta.trim();
  }

  const vacio = h("div", { class: "aviso vacio", hidden: true },
    h("p", {}, "No está en el catálogo todavía. Prueba con otro nombre, con las siglas o con el cuerpo o escala (por ejemplo, «auxiliar», «TCAE» o «policía»)."),
  );

  const miId = guardado.leer("mi-oposicion", null);
  const mia = d.oposiciones.find((o) => o.id === miId);

  pagina([
    h("h1", {}, "¿Qué oposición preparas?"),
    h("p", { class: "intro" }, "Temario oficial, normas en PDF, libros y fechas de examen de todas las oposiciones de España."),
    h("label", { class: "buscador", for: "q" }, h("span", { class: "solo-lectores" }, "Buscar oposición"), entrada),
    filtros,
  ], [
    h("aside", { class: "lateral" }, h("h2", { class: "lateral-titulo" }, "Áreas"), listaAreas),
    h("div", { class: "columna" },
      mia && h("p", { class: "mia" }, "Tu oposición: ", h("a", { href: `#/oposicion/${mia.id}` }, mia.nombre)),
      estado, lista, vacio,
      h("h2", {}, "Normas que sirven para casi todas"),
      h("p", { class: "nota" }, "Búscalas artículo a artículo o descárgalas enteras en PDF."),
      h("div", { class: "troncales" },
        d.normas.slice(0, 8).map((n) => h("a", { href: `#/normas?norma=${n.slug}` }, nombreCorto(n.nombre)))),
    ),
  ], { clase: "con-lateral" });
  pintar();
}

const nombreCorto = (nombre) => nombre.replace(/\s*\(.*\)$/, "").split(",")[0];

function filaOposicion(o, consulta, d, abrir) {
  const nombresNorma = new Map(d.normas.map((n) => [n.slug, n]));
  const anuncios = convocatoriasDe(o, d.convocatorias).slice(0, 5);
  const urlLibros = `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(`${o.nombre} temario oposiciones`)}`;

  return h("li", { style: colorDe(o.area) },
    h("details", { open: abrir },
      h("summary", {},
        h("span", { class: "nombre" }, marcar(o.nombre, consulta)),
        h("span", { class: "meta" },
          o.grupo ? h("span", { class: "grupo", title: `Grupo ${o.grupo}` }, o.grupo) : null,
          h("span", {}, ambitoTexto(o.ambito)),
          h("span", {}, o.area)),
      ),
      h("div", { class: "detalle" },
        h("p", {}, h("a", { class: "boton", href: `#/oposicion/${o.id}` }, "Abrir la página de esta oposición")),
        h("h3", {}, "Convocatorias recientes en el BOE"),
        anuncios.length
          ? h("ul", {}, anuncios.map((c) => h("li", {}, h("span", { class: "fecha" }, formatearFecha(c.fecha)), h("a", { href: c.url_html || c.url_pdf, rel: "noopener" }, resumirTitulo(c.titulo)))))
          : h("p", { class: "nota" }, o.boe?.length
              ? "No hay anuncios recientes de este cuerpo en el BOE."
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
          : h("p", { class: "nota" }, "Estamos reuniendo recursos para este cuerpo."),
        h("ul", {},
          h("li", {}, h("a", { href: urlLibros, rel: "noopener" }, "Buscar libros del temario")),
          h("li", {}, h("a", { href: "https://www.boe.es/biblioteca_juridica/", rel: "noopener" }, "Códigos legales gratuitos del BOE")),
        ),
      ),
    ),
  );
}

const ambitoTexto = (a) => ({ Estado: "Estado", Autonómica: "Comunidades autónomas", Local: "Administración local" }[a] ?? a);
const resumirTitulo = (t) => (t.length > 150 ? t.slice(0, 150).replace(/\s+\S*$/, "") + "…" : t);

/* ---------- vista: página de una oposición ---------- */

const ENLACE_EXT = { rel: "noopener noreferrer" };

function vistaOposicion(d, params, id) {
  const o = d.oposiciones.find((x) => x.id === id);
  if (!o) {
    principal.replaceChildren(h("h1", {}, "No encontramos esa oposición"), h("p", {}, h("a", { href: "#/" }, "Volver al buscador")));
    return;
  }
  const pestanas = [["temario", "Temario"], ["plan", "Mi plan"], ["normas", "Normas"], ["recursos", "Libros y apuntes"], ["fechas", "Fechas"]];
  let activa = pestanas.some(([k]) => k === params.get("ver")) ? params.get("ver") : "temario";
  const nombresNorma = new Map(d.normas.map((n) => [n.slug, n]));
  const esMia = () => guardado.leer("mi-oposicion", null) === o.id;

  const cuerpo = h("div", { class: "panel", role: "tabpanel" });
  const barra = h("div", { class: "pestanas", role: "tablist" });
  const botonMia = h("button", { type: "button", class: "chip", onclick: () => {
    guardado.escribir("mi-oposicion", esMia() ? null : o.id); pintarBoton();
  } });
  const pintarBoton = () => { botonMia.textContent = esMia() ? "★ Es mi oposición" : "☆ Marcar como mi oposición"; botonMia.setAttribute("aria-pressed", String(esMia())); };

  function pintar() {
    barra.replaceChildren(...pestanas.map(([k, t]) => h("button", {
      type: "button", role: "tab", "aria-selected": String(k === activa),
      onclick: () => { activa = k; fijarParam(params, "ver", k, "temario"); pintar(); },
    }, t)));
    cuerpo.replaceChildren(...{ temario: panelTemario, plan: panelPlan, normas: panelNormas, recursos: panelRecursos, fechas: panelFechas }[activa]());
  }

  function panelTemario() {
    const nodo = h("div", {}, h("p", { class: "nota" }, "Cargando el temario…"));
    cargarJson(`data/temarios/${o.id}.json`, null).then((t) => {
      if (!t) {
        nodo.replaceChildren(h("p", {}, "El temario oficial se publica en las bases de cada convocatoria; aparecerá aquí cuando se publique en el BOE."),
          h("p", {}, h("a", { href: "#/calendario" }, "Ver convocatorias recientes")));
        return;
      }
      const clave = `progreso-${o.id}`;
      const hechos = new Set(guardado.leer(clave, []));
      const cuenta = h("p", { class: "estado", "aria-live": "polite" });
      const actualizar = () => { cuenta.textContent = `Llevas ${hechos.size} de ${t.temas.length} temas.`; };
      actualizar();
      nodo.replaceChildren(
        h("p", { class: "nota" }, "Programa oficial según la última convocatoria publicada en el BOE. ",
          t.url ? h("a", { href: t.url, ...ENLACE_EXT }, "Ver la convocatoria") : null),
        cuenta,
        h("ol", { class: "temas" }, t.temas.map((tema) => h("li", {},
          h("label", {},
            h("input", { type: "checkbox", checked: hechos.has(tema.numero), onchange: (e) => {
              e.target.checked ? hechos.add(tema.numero) : hechos.delete(tema.numero);
              guardado.escribir(clave, [...hechos]); actualizar();
            } }),
            h("span", { class: "num" }, String(tema.numero)), h("span", {}, tema.titulo)),
          h("details", { class: "apuntes" }, h("summary", {}, "Buscar apuntes de este tema"),
            h("ul", {}, enlacesApuntes(tema.titulo, o.nombre).map((e) => h("li", {}, h("a", { href: e.url, ...ENLACE_EXT }, e.texto)))))))),
      );
    });
    return [nodo];
  }

  function panelPlan() {
    const clave = `plan-${o.id}`;
    const guardadoPlan = guardado.leer(clave, {});
    const proximo = convocatoriasDe(o, d.convocatorias).find((c) => c.fecha_examen && c.fecha_examen >= hoyISO());
    const salida = h("div", { "aria-live": "polite" });
    const campoExamen = h("input", { id: "fecha-examen", type: "date", min: hoyISO(), value: guardadoPlan.examen ?? proximo?.fecha_examen ?? "" });
    const campoTemas = h("input", { id: "total-temas", type: "number", min: "1", max: "200", inputmode: "numeric", value: guardadoPlan.temas ?? "" });
    cargarJson(`data/temarios/${o.id}.json`, null).then((t) => {
      if (t && !campoTemas.value) { campoTemas.value = String(t.temas.length); calcular(); }
    });

    function calcular() {
      const examen = campoExamen.value;
      const totalTemas = Number(campoTemas.value);
      guardado.escribir(clave, { examen, temas: totalTemas || "" });
      if (!examen || !totalTemas) {
        salida.replaceChildren(h("p", { class: "nota" }, "Indica la fecha de tu examen y cuántos temas tiene el temario para ver tu plan semana a semana."));
        return;
      }
      const dias = diasHasta(examen, hoyISO());
      const plan = planificarEstudio({ totalTemas, hoy: hoyISO(), examen });
      salida.replaceChildren(
        h("p", { class: "cuenta-atras" }, dias >= 0 ? `Faltan ${dias} ${dias === 1 ? "día" : "días"} para tu examen.` : "Esa fecha ya ha pasado."),
        plan.aviso ? h("p", { class: "aviso" }, plan.aviso) : null,
        h("ol", { class: "plan" }, plan.semanas.map((sem) => h("li", { class: sem.tipo },
          h("span", { class: "fecha" }, `${formatearFecha(sem.desde)} – ${formatearFecha(sem.hasta)}`),
          h("strong", {}, sem.tipo === "estudio"
            ? (sem.temas[0] === sem.temas[1] ? `Tema ${sem.temas[0]}` : `Temas ${sem.temas[0]} a ${sem.temas[1]}`)
            : "Repaso general y simulacros")))),
        h("p", { class: "nota" }, "Las últimas semanas se reservan para repasar. Ajusta el ritmo a tus horas reales de estudio."),
      );
    }
    campoExamen.addEventListener("input", calcular);
    campoTemas.addEventListener("input", calcular);
    calcular();
    return [
      proximo ? h("p", { class: "nota" }, `Fecha de examen publicada: ${formatearFecha(proximo.fecha_examen)}.`) : null,
      h("div", { class: "campo corto" }, h("label", { for: "fecha-examen" }, h("span", {}, "Fecha de tu examen")), campoExamen),
      h("div", { class: "campo corto" }, h("label", { for: "total-temas" }, h("span", {}, "Número de temas")), campoTemas),
      salida,
    ].filter(Boolean);
  }

  function panelNormas() {
    const lista = (o.normas ?? []).filter((s) => nombresNorma.has(s));
    return [h("p", { class: "nota" }, "Busca artículo a artículo en el texto consolidado del BOE."),
      h("ul", { class: "enlaces" }, lista.map((s) => h("li", {},
        h("a", { href: `#/normas?norma=${s}` }, nombresNorma.get(s).nombre), " · ",
        h("a", { href: urlPdfBoe(nombresNorma.get(s).id), rel: "noopener" }, "PDF"))))];
  }

  function panelRecursos() {
    const propios = (o.recursos ?? []).filter((r) => enlaceVivo(d, r.url));
    const oficiales = (o.enlaces ?? []).filter((e) => enlaceVivo(d, e.url));
    const libros = `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(`${o.nombre} temario oposiciones`)}`;
    const academias = d.recursos.academias.filter((a) => enlaceVivo(d, a.url));
    return [
      h("h3", {}, "Enlaces oficiales"),
      h("ul", { class: "enlaces" }, [
        ...oficiales.map((e) => h("li", {}, h("a", { href: e.url, ...ENLACE_EXT }, e.titulo))),
        ...d.recursos.estado.filter((e) => o.ambito === "Estado" && !["Seguridad", "Defensa"].includes(o.area) && enlaceVivo(d, e.url))
          .map((e) => h("li", {}, h("a", { href: e.url, ...ENLACE_EXT }, e.nombre), h("span", { class: "nota" }, ` · ${e.descripcion}`))),
      ]),
      ...((o.examenes ?? []).filter((x) => enlaceVivo(d, x.url)).length
        ? [h("h3", {}, "Exámenes anteriores (publicados por el organismo)"),
           h("ul", { class: "enlaces" }, o.examenes.filter((x) => enlaceVivo(d, x.url)).map((x) => h("li", {}, h("a", { href: x.url, ...ENLACE_EXT }, x.titulo))))]
        : []),
      h("h3", {}, "Libros, apuntes y tests"),
      h("ul", { class: "enlaces" }, [
        ...propios.map((r) => h("li", {}, h("a", { href: r.url, ...ENLACE_EXT }, r.titulo), h("span", { class: "nota" }, ` · ${[r.fuente, r.tipo].filter(Boolean).join(", ")}${r.gratuito ? " (gratis)" : ""}`))),
        h("li", {}, h("a", { href: libros, ...ENLACE_EXT }, "Buscar libros del temario")),
        h("li", {}, h("a", { href: `https://www.google.com/search?q=${encodeURIComponent(`${o.nombre} exámenes oficiales anteriores filetype:pdf`)}`, ...ENLACE_EXT }, "Exámenes oficiales de años anteriores")),
        h("li", {}, h("a", { href: "https://www.boe.es/biblioteca_juridica/", ...ENLACE_EXT }, "Códigos legales gratuitos del BOE")),
      ]),
      h("h3", {}, "Academias con material de muestra"),
      h("ul", { class: "enlaces" }, academias.map((a) => h("li", {}, h("a", { href: a.url, ...ENLACE_EXT }, a.nombre), h("span", { class: "nota" }, ` · ${a.descripcion}`)))),
      h("p", { class: "nota" }, "Las academias son empresas privadas: compara y prueba el material gratuito antes de pagar."),
    ];
  }

  function panelFechas() {
    const anuncios = convocatoriasDe(o, d.convocatorias).slice(0, 8);
    return [
      anuncios.length
        ? h("ul", { class: "enlaces" }, anuncios.map((c) => h("li", {}, h("span", { class: "fecha" }, formatearFecha(c.fecha)), h("a", { href: c.url_html || c.url_pdf, ...ENLACE_EXT }, resumirTitulo(c.titulo)))))
        : h("p", { class: "nota" }, o.boe?.length ? "No hay anuncios recientes de este cuerpo en el BOE." : "Esta oposición se convoca en el boletín de tu comunidad o ayuntamiento."),
      h("p", {}, h("a", { href: "#/calendario" }, "Ver el calendario completo"), " · ", h("a", { href: "#/comunidades" }, "Boletines por comunidad")),
    ];
  }

  document.title = `${o.nombre} | Oposiciones de España`;
  pagina([
    h("p", { class: "migas" }, h("a", { href: "#/" }, "← Todas las oposiciones")),
    h("h1", {}, o.nombre),
    h("p", { class: "meta" }, o.grupo && h("span", { class: "grupo" }, `Grupo ${o.grupo}`), h("span", {}, ambitoTexto(o.ambito)), h("span", {}, o.area)),
    botonMia,
  ], [barra, cuerpo], { estilo: colorDe(o.area) });
  pintarBoton();
  pintar();
}

/* ---------- vista: comunidades autónomas ---------- */

function vistaComunidades(d, params) {
  const lista = d.recursos.comunidades;
  let id = params.get("c") ?? guardado.leer("mi-comunidad", lista[0]?.id);
  const ficha = h("div", { class: "ficha-comunidad" });
  const selector = h("select", { id: "comunidad", onchange: (e) => { id = e.target.value; guardado.escribir("mi-comunidad", id); fijarParam(params, "c", id); pintar(); } },
    lista.map((c) => h("option", { value: c.id, selected: c.id === id }, c.nombre)));

  function pintar() {
    const c = lista.find((x) => x.id === id) ?? lista[0];
    if (!c) { ficha.replaceChildren(h("p", {}, "No se han podido cargar las comunidades.")); return; }
    const filas = [
      ["Boletín oficial", c.boletin.nombre, c.boletin.url],
      ["Empleo público", "Ofertas y convocatorias", c.empleo],
      ["Sanidad", c.sanidad.nombre, c.sanidad.url],
      ["Educación", "Oposiciones docentes", c.educacion],
    ].filter(([, , url]) => enlaceVivo(d, url));
    const anuncios = convocatoriasDeComunidad(c.id, d.convocatorias).slice(0, 12);
    ficha.replaceChildren(h("h2", {}, c.nombre),
      h("ul", { class: "enlaces grande" }, filas.map(([t, n, url]) => h("li", {}, h("span", { class: "nota" }, t), h("a", { href: url, ...ENLACE_EXT }, n)))),
      h("h3", {}, "Últimas convocatorias publicadas en el BOE"),
      anuncios.length
        ? h("ul", { class: "enlaces" }, anuncios.map((a) => h("li", {}, h("span", { class: "fecha" }, formatearFecha(a.fecha)), h("a", { href: a.url_html || a.url_pdf, ...ENLACE_EXT }, resumirTitulo(a.titulo)))))
        : h("p", { class: "nota" }, "Ahora mismo no hay anuncios de esta comunidad en el BOE."),
      h("p", { class: "nota" }, "Cada comunidad publica la mayoría de sus convocatorias en su propio boletín: ahí están las bases y el temario de tu oposición."));
  }
  pagina([
    h("h1", {}, "Tu comunidad autónoma"),
    h("p", { class: "intro" }, "Convocatorias recientes, boletín oficial, empleo público, sanidad y educación de cada comunidad."),
    h("div", { class: "campo" }, h("label", { for: "comunidad" }, h("span", {}, "Comunidad")), selector),
  ], [ficha]);
  pintar();
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
      h("a", { class: "boton", href: urlPdfBoe(entradaNorma.id) || urlBoe, rel: "noopener", download: "" }, "Descargar entera en PDF"), " ",
      h("a", { href: urlBoe, rel: "noopener" }, "Abrir en el BOE"));

    if (!norma) {
      resultados.replaceChildren();
      estado.replaceChildren("El texto de esta norma no está disponible aquí por ahora. Mientras tanto, ",
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

  pagina([
    h("h1", {}, "Normas y documentos troncales"),
    h("p", { class: "intro" }, "La Constitución y las leyes que más se preguntan: búscalas artículo a artículo o descárgalas enteras en PDF."),
    h("div", { class: "campo" }, h("label", { for: "norma" }, h("span", {}, "Norma")), selector),
    h("div", { class: "campo" }, h("label", { for: "qn" }, h("span", {}, "Buscar dentro de la norma")), entrada),
  ], [
    cabeceraNorma, estado, resultados,
    d.cambios.length ? h("h2", {}, "Novedades: normas modificadas") : null,
    d.cambios.length ? h("ul", { class: "enlaces" }, d.cambios.slice(0, 10).map((c) => {
      const dia = String(c.fecha).slice(0, 8);
      const iso = /^\d{8}$/.test(dia) ? `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}` : "";
      const slug = d.normas.find((n) => n.id === c.id)?.slug;
      return h("li", {}, iso ? h("span", { class: "fecha" }, `Actualizada el ${formatearFecha(iso)}`) : null,
        slug ? h("a", { href: `#/normas?norma=${slug}` }, c.norma) : c.norma);
    })) : null,
    h("h2", {}, "Descarga las normas completas"),
    h("p", { class: "nota" }, "PDF oficial del BOE con el texto consolidado, sin tener que leerlo en la web."),
    h("ul", { class: "descargas" }, d.normas.map((n) =>
      h("li", {}, h("a", { href: urlPdfBoe(n.id), rel: "noopener" }, nombreCorto(n.nombre)), h("span", { class: "nota" }, " · PDF")))),
  ]);
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
  let comunidad = params.get("c") ?? "todas";

  const estado = h("p", { class: "estado", "aria-live": "polite" });
  const contenedor = h("div", {});
  const entrada = h("input", {
    id: "qc", type: "search", name: "q", value: texto, autocomplete: "off", spellcheck: "false", enterkeyhint: "search",
    placeholder: "Filtrar por cuerpo, ministerio o comunidad",
    oninput: (e) => { texto = e.target.value; fijarParam(params, "q", texto.trim()); pintar(); },
  });
  const tipos = [["todos", "Todo"], ["plazo", "Plazos"], ["examen", "Exámenes"], ["convocatoria", "Convocatorias"]];
  const filtros = h("fieldset", { class: "filtros" },
    h("legend", {}, "Mostrar"),
    tipos.flatMap(([valor, etiqueta]) => [
      h("input", { type: "radio", name: "tipo", id: `tipo-${valor}`, value: valor, checked: valor === tipo,
        onchange: () => { tipo = valor; fijarParam(params, "tipo", valor, "todos"); pintar(); } }),
      h("label", { for: `tipo-${valor}` }, etiqueta),
    ]),
  );
  const selectorComunidad = h("select", { id: "comunidad-cal", onchange: (e) => { comunidad = e.target.value; fijarParam(params, "c", comunidad, "todas"); pintar(); } },
    h("option", { value: "todas", selected: comunidad === "todas" }, "Todas las administraciones"),
    h("option", { value: "estado", selected: comunidad === "estado" }, "Estado (BOE)"),
    d.recursos.comunidades.map((c) => h("option", { value: c.id, selected: c.id === comunidad }, c.nombre)));
  const casilla = h("label", { class: "casilla" },
    h("input", { type: "checkbox", checked: antiguos,
      onchange: (e) => { antiguos = e.target.checked; fijarParam(params, "antiguos", antiguos ? "1" : ""); pintar(); } }),
    "Incluir fechas de hace más de un mes");

  const todos = construirEventos(d.convocatorias, d.examenes);

  function pintar() {
    const desde = antiguos ? "" : restarDias(hoyISO(), 30);
    const eventos = filtrarEventos(todos, { tipo, texto, desde, comunidad });
    const meses = agruparPorMes(eventos);
    contenedor.replaceChildren(...meses.map((mes) =>
      h("section", { class: "mes" },
        h("h2", {}, mes.etiqueta),
        h("ol", {}, mes.eventos.map((e) => h("li", { class: `evento ${e.tipo}` },
          h("time", { datetime: e.fecha, title: formatearFecha(e.fecha) }, formatearDia(e.fecha)),
          h("div", {},
            h("p", { class: "titulo" }, h("span", { class: "tipo" }, { examen: "Examen", plazo: "Fin de plazo", convocatoria: "Convocatoria" }[e.tipo]), marcar(resumirTitulo(e.titulo), texto)),
            h("p", { class: "organismo" }, [e.organismo, e.plazo ? `Plazo: ${e.plazo} (orientativo)` : "", e.tasa != null ? `Tasa: ${e.tasa.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €` : "", e.fuente ? `Fuente: ${e.fuente}` : ""].filter(Boolean).join(". ")),
            e.url ? h("a", { href: e.url, rel: "noopener" }, "Ver el anuncio oficial") : null))))),
    ));
    if (eventos.length) estado.textContent = `${eventos.length} ${eventos.length === 1 ? "fecha" : "fechas"}.`;
    else if (!todos.length) estado.textContent = "Todavía no hay fechas publicadas. Vuelve pronto: se actualizan cada día con el BOE.";
    else estado.textContent = "No hay fechas con esos filtros.";
  }

  const urlIcs = new URL("data/examenes.ics", location.href);
  pagina([
    h("h1", {}, "Calendario de convocatorias y exámenes"),
    h("p", { class: "intro" }, "Las convocatorias se toman del BOE cada día y las fechas de examen, de los anuncios oficiales de admitidos."),
    h("p", { class: "suscripcion" }, h("a", { class: "boton", href: urlIcs.href.replace(/^https?:/, "webcal:") }, "Añadir los exámenes a mi calendario"), " ",
      h("a", { href: "data/convocatorias.xml" }, "Recibir avisos de nuevas convocatorias (RSS)")),
  ], [
    h("div", { class: "campo" }, h("label", { for: "qc" }, h("span", {}, "Buscar")), entrada),
    h("div", { class: "campo" }, h("label", { for: "comunidad-cal" }, h("span", {}, "Administración")), selectorComunidad),
    filtros, casilla, estado, contenedor,
    h("p", { class: "aviso" }, "Cada comunidad, ayuntamiento y universidad publica en su propio boletín, así que sus fechas pueden no aparecer aquí. Consulta siempre el boletín oficial de tu convocatoria."),
  ]);
  pintar();
}

/* ---------- vista: herramientas ---------- */

function campoNumero(id, etiqueta, valor, alCambiar, paso = "any") {
  const entrada = h("input", { id, type: "number", inputmode: "decimal", min: "0", step: paso, value: valor, oninput: alCambiar });
  return h("div", { class: "campo corto" }, h("label", { for: id }, h("span", {}, etiqueta)), entrada);
}

const euros = (n) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function vistaHerramientas() {
  const v = guardado.leer("herramientas", { aciertos: "", errores: "", blancos: "", penal: "0.3333", tasa: "", academia: "", meses: "", material: "", viajes: "", costeViaje: "" });
  const resNota = h("p", { class: "resultado", "aria-live": "polite" });
  const resCoste = h("p", { class: "resultado", "aria-live": "polite" });
  const cambia = (clave) => (e) => { v[clave] = e.target.value; guardado.escribir("herramientas", v); calcular(); };

  function calcular() {
    const n = notaTest({ aciertos: v.aciertos, errores: v.errores, blancos: v.blancos, penalizacion: Number(v.penal) });
    resNota.textContent = n.nota === null ? "Escribe tus aciertos, errores y respuestas en blanco."
      : `Nota: ${n.nota.toLocaleString("es-ES")} sobre 10 (${n.puntos.toLocaleString("es-ES")} puntos netos de ${n.preguntas} preguntas).`;
    const c = costeOposicion({ tasa: v.tasa, academiaMes: v.academia, meses: v.meses, material: v.material, viajes: v.viajes, costeViaje: v.costeViaje });
    resCoste.textContent = c.total === 0 ? "Rellena lo que te corresponda para ver el coste total."
      : `Coste total: ${euros(c.total)}${c.porMes ? ` (unos ${euros(c.porMes)} al mes)` : ""}.`;
  }

  const penal = h("select", { id: "penal", onchange: cambia("penal") },
    [["0.3333", "Cada 3 errores restan 1 acierto"], ["0.25", "Cada 4 errores restan 1 acierto"], ["0.5", "Cada 2 errores restan 1 acierto"], ["0", "Los errores no penalizan"]]
      .map(([valor, texto]) => h("option", { value: valor, selected: valor === v.penal }, texto)));

  pagina([
    h("h1", {}, "Herramientas para opositores"),
    h("p", { class: "intro" }, "Calcula la nota de un simulacro y cuánto te costará preparar la oposición."),
  ], [
    h("h2", { class: "primero" }, "Nota de un test"),
    h("div", { class: "campo" }, h("label", { for: "penal" }, h("span", {}, "Penalización de los errores")), penal),
    h("div", { class: "fila-campos" },
      campoNumero("aciertos", "Aciertos", v.aciertos, cambia("aciertos"), "1"),
      campoNumero("errores", "Errores", v.errores, cambia("errores"), "1"),
      campoNumero("blancos", "En blanco", v.blancos, cambia("blancos"), "1")),
    resNota,
    h("h2", {}, "Coste de la oposición"),
    h("div", { class: "fila-campos" },
      campoNumero("tasa", "Tasa de examen (€)", v.tasa, cambia("tasa")),
      campoNumero("academia", "Academia al mes (€)", v.academia, cambia("academia")),
      campoNumero("meses", "Meses de preparación", v.meses, cambia("meses"), "1"),
      campoNumero("material", "Libros y material (€)", v.material, cambia("material")),
      campoNumero("viajes", "Viajes a exámenes", v.viajes, cambia("viajes"), "1"),
      campoNumero("coste-viaje", "Coste por viaje (€)", v.costeViaje, cambia("costeViaje"))),
    resCoste,
    h("h2", {}, "Plan de estudio"),
    h("p", {}, "Está en la página de cada oposición, en la pestaña «Mi plan»: ", h("a", { href: "#/" }, "busca la tuya"), "."),
  ]);
  calcular();
}

/* ---------- vista: sugerencias ---------- */

function vistaAyuda(d) {
  const campos = { tipo: "Sugerir un recurso", oposicion: "", enlace: "", mensaje: "" };
  const enlace = h("a", { class: "boton", href: "#", "aria-disabled": "true" }, "Preparar el correo");
  const refrescar = () => {
    const url = campos.mensaje.trim() ? construirMailto(d.config.contacto, campos) : "";
    enlace.setAttribute("href", url || "#");
    enlace.setAttribute("aria-disabled", String(!url));
  };
  const texto = (clave) => (e) => { campos[clave] = e.target.value; refrescar(); };
  pagina([
    h("h1", {}, "Sugerencias y correcciones"),
    h("p", { class: "intro" }, "¿Echas en falta un libro, una web oficial o una oposición? ¿Hay un dato mal? Cuéntanoslo."),
  ], [
    h("div", { class: "campo" }, h("label", { for: "tipo" }, h("span", {}, "¿Qué quieres contarnos?")),
      h("select", { id: "tipo", onchange: texto("tipo") }, ["Sugerir un recurso", "Avisar de un error", "Pedir una oposición nueva", "Otra cosa"].map((t) => h("option", {}, t)))),
    h("div", { class: "campo" }, h("label", { for: "opo" }, h("span", {}, "Oposición (opcional)")),
      h("input", { id: "opo", type: "text", list: "lista-opos", oninput: texto("oposicion") }),
      h("datalist", { id: "lista-opos" }, d.oposiciones.map((o) => h("option", { value: o.nombre })))),
    h("div", { class: "campo" }, h("label", { for: "enlace-sug" }, h("span", {}, "Enlace (opcional)")), h("input", { id: "enlace-sug", type: "url", placeholder: "https://", oninput: texto("enlace") })),
    h("div", { class: "campo" }, h("label", { for: "mensaje" }, h("span", {}, "Mensaje")),
      h("textarea", { id: "mensaje", rows: "5", oninput: texto("mensaje") })),
    h("p", {}, enlace),
    h("p", { class: "nota" }, "Se abrirá tu programa de correo con el mensaje listo para enviar."),
  ]);
}

/* ---------- arranque ---------- */

let datos = null;

async function pintarRuta() {
  const { ruta, params } = leerHash();
  for (const a of document.querySelectorAll(".cabecera nav a")) {
    if (a.dataset.ruta === ruta) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  document.title = {
    "/normas": "Normas y documentos troncales | Oposiciones de España",
    "/calendario": "Calendario de oposiciones | Oposiciones de España",
    "/comunidades": "Tu comunidad autónoma | Oposiciones de España",
    "/herramientas": "Herramientas para opositores | Oposiciones de España",
    "/ayuda": "Sugerencias y correcciones | Oposiciones de España",
  }[ruta] ?? "Oposiciones de España: temarios, normas y calendario";
  if (ruta.startsWith("/oposicion/")) { vistaOposicion(datos, params, decodeURIComponent(ruta.slice(11))); return; }
  const vista = { "/": vistaOposiciones, "/normas": vistaNormas, "/calendario": vistaCalendario, "/comunidades": vistaComunidades, "/herramientas": vistaHerramientas, "/ayuda": vistaAyuda }[ruta] ?? vistaOposiciones;
  vista(datos, params);
}

async function iniciar() {
  datos = await cargarDatos();
  if (datos.estado?.actualizado) {
    document.getElementById("pie-datos").textContent =
      `Datos del BOE actualizados el ${formatearFecha(datos.estado.actualizado.slice(0, 10))}. Fuente: Agencia Estatal Boletín Oficial del Estado.`;
  }
  if (contactoValido(datos.config?.contacto)) document.getElementById("enlace-ayuda").hidden = false;
  await pintarRuta();
  window.addEventListener("hashchange", () => { pintarRuta(); window.scrollTo(0, 0); });
}

iniciar();
