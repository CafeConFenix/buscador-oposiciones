import { buscarOposiciones, buscarArticulos, dividirResaltado, convocatoriasDe, esConsultaDeArticulo } from "./busqueda.js";
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

const hoyISO = () => new Date().toISOString().slice(0, 10);
const restarDias = (iso, dias) => new Date(Date.parse(iso) - dias * 864e5).toISOString().slice(0, 10);

/* ---------- datos ---------- */

async function cargarDatos() {
  const [oposiciones, normas, convocatorias, examenes, estado, recursos, enlacesEstado] = await Promise.all([
    cargarJson("data/oposiciones.json", []),
    cargarJson("data/normas.json", []),
    cargarJson("data/convocatorias.json", []),
    cargarJson("data/examenes.json", []),
    cargarJson("data/estado.json", null),
    cargarJson("data/recursos.json", { comunidades: [], estado: [], academias: [] }),
    cargarJson("data/enlaces_estado.json", {}),
  ]);
  return { oposiciones, normas, convocatorias, examenes, estado, recursos, enlacesEstado };
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
    h("p", {}, "No está en el catálogo todavía. Prueba con otro nombre, con las siglas o con el cuerpo o escala (por ejemplo, «auxiliar», «TCAE» o «policía»)."),
  );

  const miId = guardado.leer("mi-oposicion", null);
  const mia = d.oposiciones.find((o) => o.id === miId);
  const areas = [...new Set(d.oposiciones.map((o) => o.area))].sort((a, b) => a.localeCompare(b, "es"));

  principal.replaceChildren(...[
    h("h1", {}, "¿Qué oposición preparas?"),
    h("label", { class: "buscador", for: "q" },
      h("span", { class: "solo-lectores" }, "Buscar oposición"), entrada),
    mia && h("p", { class: "mia" }, "Tu oposición: ", h("a", { href: `#/oposicion/${mia.id}` }, mia.nombre)),
    filtros,
    h("p", { class: "etiqueta-areas" }, "O explora por área"),
    h("div", { class: "areas" },
      areas.map((a) => h("button", { type: "button", class: "chip", onclick: () => { entrada.value = a; consulta = a; fijarParam(params, "q", a); pintar(); entrada.focus(); } }, a))),
    estado, lista, vacio,
    h("h2", {}, "Normas que sirven para casi todas"),
    h("p", {}, "Búscalas artículo a artículo, con el texto consolidado del BOE."),
    h("div", { class: "troncales" },
      d.normas.slice(0, 8).map((n) => h("a", { href: `#/normas?norma=${n.slug}` }, nombreCorto(n.nombre)))),
  ].filter(Boolean));
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
  const pestanas = [["temario", "Temario"], ["normas", "Normas"], ["recursos", "Libros y apuntes"], ["fechas", "Fechas"]];
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
    cuerpo.replaceChildren(...{ temario: panelTemario, normas: panelNormas, recursos: panelRecursos, fechas: panelFechas }[activa]());
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
            h("span", { class: "num" }, String(tema.numero)), h("span", {}, tema.titulo))))),
      );
    });
    return [nodo];
  }

  function panelNormas() {
    const lista = (o.normas ?? []).filter((s) => nombresNorma.has(s));
    return [h("p", { class: "nota" }, "Busca artículo a artículo en el texto consolidado del BOE."),
      h("ul", { class: "enlaces" }, lista.map((s) => h("li", {}, h("a", { href: `#/normas?norma=${s}` }, nombresNorma.get(s).nombre))))];
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
        ...d.recursos.estado.filter((e) => o.ambito === "Estado" && enlaceVivo(d, e.url))
          .map((e) => h("li", {}, h("a", { href: e.url, ...ENLACE_EXT }, e.nombre), h("span", { class: "nota" }, ` · ${e.descripcion}`))),
      ]),
      h("h3", {}, "Libros, apuntes y tests"),
      h("ul", { class: "enlaces" }, [
        ...propios.map((r) => h("li", {}, h("a", { href: r.url, ...ENLACE_EXT }, r.titulo), r.tipo ? ` (${r.tipo}${r.gratuito ? ", gratis" : ""})` : "")),
        h("li", {}, h("a", { href: libros, ...ENLACE_EXT }, "Buscar libros del temario")),
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
  principal.replaceChildren(
    h("p", { class: "migas" }, h("a", { href: "#/" }, "← Todas las oposiciones")),
    h("h1", {}, o.nombre),
    h("p", { class: "meta" }, [o.grupo ? `Grupo ${o.grupo}` : null, ambitoTexto(o.ambito), o.area].filter(Boolean).join(" · ")),
    botonMia, barra, cuerpo,
  );
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
    ficha.replaceChildren(h("h2", {}, c.nombre),
      h("ul", { class: "enlaces grande" }, filas.map(([t, n, url]) => h("li", {}, h("span", { class: "nota" }, t), h("a", { href: url, ...ENLACE_EXT }, n)))),
      h("p", { class: "nota" }, "Cada comunidad publica sus convocatorias en su propio boletín: ahí están las bases y el temario de tu oposición."));
  }
  principal.replaceChildren(
    h("h1", {}, "Tu comunidad autónoma"),
    h("p", {}, "Boletín oficial, empleo público, sanidad y educación de cada comunidad, para encontrar las convocatorias que no salen en el BOE."),
    h("div", { class: "campo" }, h("label", { for: "comunidad" }, h("span", {}, "Comunidad")), selector),
    ficha,
  );
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
    else if (!todos.length) estado.textContent = "Todavía no hay fechas publicadas. Vuelve pronto: se actualizan cada día con el BOE.";
    else estado.textContent = "No hay fechas con esos filtros.";
  }

  const urlIcs = new URL("data/examenes.ics", location.href);
  principal.replaceChildren(
    h("h1", {}, "Calendario de convocatorias y exámenes"),
    h("p", {}, "Las convocatorias del Estado se toman del BOE cada día, y las fechas de examen, de los anuncios oficiales de admitidos."),
    h("p", { class: "suscripcion" }, "Suscríbete desde tu calendario: ",
      h("a", { href: urlIcs.href.replace(/^https?:/, "webcal:") }, "añadir exámenes a mi calendario"), "."),
    h("div", { class: "campo" }, h("label", { for: "qc" }, h("span", {}, "Buscar")), entrada),
    filtros, casilla, estado, contenedor,
    h("p", { class: "aviso" }, "Cada comunidad, ayuntamiento y universidad publica en su propio boletín, así que sus fechas pueden no aparecer aquí. Consulta siempre el boletín oficial de tu convocatoria."),
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
  document.title = {
    "/normas": "Normas y documentos troncales | Oposiciones de España",
    "/calendario": "Calendario de oposiciones | Oposiciones de España",
    "/comunidades": "Tu comunidad autónoma | Oposiciones de España",
  }[ruta] ?? "Oposiciones de España: temarios, normas y calendario";
  if (ruta.startsWith("/oposicion/")) { vistaOposicion(datos, params, decodeURIComponent(ruta.slice(11))); return; }
  const vista = { "/": vistaOposiciones, "/normas": vistaNormas, "/calendario": vistaCalendario, "/comunidades": vistaComunidades }[ruta] ?? vistaOposiciones;
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
