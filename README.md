# Oposiciones de España

Web gratuita en español para buscar la oposición que preparas y encontrar, en un solo sitio:

- **Buscador de oposiciones** (con siglas y nombres coloquiales: «TCAE», «Benemérita», «auxiliar del Estado»…).
- **Normas troncales** (Constitución, Ley 39/2015, Ley 40/2015, EBEP, Código Penal…) con búsqueda por artículo: escribe `art 14` y salta al artículo 14.
- **Calendario** de convocatorias y exámenes que se actualiza solo cada día desde el BOE, con suscripción desde Google Calendar, Apple o Outlook.
- Enlaces oficiales, exámenes anteriores publicados por los organismos y un formulario de **sugerencias por correo** (sin necesidad de cuenta de GitHub).

Es una web estática (HTML, CSS y JavaScript sin dependencias) que se publica en **GitHub Pages**, gratis. Un robot de GitHub Actions descarga los datos del BOE cada día.

## Publicarla (una sola vez)

1. Crea un repositorio nuevo en GitHub (por ejemplo `oposiciones`) y sube todo este proyecto a la rama `main`.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. En **Settings → Actions → General → Workflow permissions**, marca **Read and write permissions**.
4. Ve a la pestaña **Actions**, elige **Actualizar datos del BOE** y pulsa **Run workflow**. La primera vez rellena unos 6 meses de convocatorias y descarga las normas (tarda unos minutos).
5. Al terminar, el propio robot lanza **Publicar la web**. Tu web quedará en `https://TU-USUARIO.github.io/oposiciones/`.

A partir de ahí el robot se ejecuta cada mañana sin que hagas nada.

## Qué está comprobado y qué no

- La lógica (lectura del sumario del BOE, extracción de convocatorias, plazos, tasas, fechas de examen, búsqueda, calendario, `.ics`) tiene tests automáticos: `python -m pytest` y `npm test`.
- Los tests usan fixtures. El de `tests/fixtures/sumario_20261119_real.json` parte del sumario real del BOE del 19/11/2026 (ids, organismos y epígrafes reales; ver `tests/fixtures/LEEME.txt`) y sigue la estructura que documenta la API oficial. La API JSON del BOE no se pudo consultar desde el entorno de desarrollo, así que **la ejecución del robot en GitHub Actions es la prueba definitiva**.
- El robot **falla de forma visible** si el BOE no responde o si, respondiendo varios días laborables, no se extrae ninguna convocatoria; en ese caso conserva los datos anteriores.
- Los identificadores BOE de las normas (`site/data/normas.json`) se comprueban al descargar: si el BOE devuelve una norma con otro título, se avisa y no se publica.

## Cómo crece el contenido

| Quieres… | Edita |
|---|---|
| Añadir o corregir una oposición | `site/data/oposiciones.json` |
| Añadir un libro, apuntes o una web a una oposición | campo `recursos` de esa oposición (`titulo`, `url`, `tipo`, `gratuito`) |
| Añadir exámenes anteriores oficiales | campo `examenes` (`titulo`, `url`, `fuente`); solo enlaces a páginas del organismo convocante |
| Leer el boletín de una comunidad | `feeds_oposiciones` en su ficha de `site/data/recursos.json` (solo feeds comprobados) |
| Activar «Sugerencias» | escribe tu correo en `contacto` de `site/data/config.json` |
| Añadir un examen de una comunidad, ayuntamiento o universidad | `site/data/examenes.json` (`fecha`, `titulo`, `url`, `fuente`) |
| Añadir una norma troncal | `site/data/normas.json` (`slug`, `nombre`, `id` del BOE, `referencia`) |

Los visitantes pueden proponer recursos o avisar de errores desde la sección «Sugerencias», que prepara un correo (no hace falta cuenta de GitHub). Aparece cuando `contacto` tiene un correo válido.

## Alcance y límites (importante)

- **Convocatorias automáticas**: solo las del **BOE** (Estado: Administración General, Justicia, Hacienda, Policía, Guardia Civil, etc.). Las de comunidades se leen de sus boletines cuando publican un feed fiable (hoy: Extremadura, descubierto automáticamente, y la sección «Oposiciones y concursos» del BOJA de Andalucía); el resto, ayuntamientos y universidades salen del BOE cuando se publican allí, o entran por `examenes.json`.
- **Catálogo**: contiene las oposiciones más habituales (157 oposiciones, 51 con libros y apuntes y 9 con exámenes anteriores oficiales). «TODAS» las de España es inabarcable de golpe porque se convocan miles de plazas distintas cada año; el catálogo está pensado para crecer con aportaciones.
- **Libros y apuntes**: no se copia ningún contenido con derechos de autor. Se enlaza a fuentes oficiales, a recursos gratuitos que la gente aporte y a búsquedas de libros.
- Los textos legales son los consolidados del BOE: informativos, sin valor jurídico. El temario válido es siempre el de las bases de tu convocatoria.

## Probar en local

```bash
python -m pytest            # tests de Python
npm test                    # tests de JavaScript
python -m http.server -d site 8000   # abre http://localhost:8000
python -m oposiciones.actualizar convocatorias --dias 7   # (desde la carpeta scripts, con acceso al BOE)
```

## Datos y licencia

Los datos de legislación y sumarios proceden del BOE (Agencia Estatal Boletín Oficial del Estado) y se reutilizan según sus condiciones de reutilización. El código se distribuye bajo licencia MIT (ver `LICENSE`).
