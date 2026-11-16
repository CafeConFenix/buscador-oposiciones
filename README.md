# Oposiciones de España

Web gratuita en español para buscar la oposición que preparas y encontrar, en un solo sitio:

- **Buscador de oposiciones** (con siglas y nombres coloquiales: «TCAE», «Benemérita», «auxiliar del Estado»…).
- **Normas troncales** (Constitución, Ley 39/2015, Ley 40/2015, EBEP, Código Penal…) con búsqueda por artículo: escribe `art 14` y salta al artículo 14.
- **Calendario** de convocatorias y exámenes que se actualiza solo cada día desde el BOE, con suscripción desde Google Calendar, Apple o Outlook.
- Enlaces oficiales y un sitio para que la gente **aporte libros, apuntes y webs**.

Es una web estática (HTML, CSS y JavaScript sin dependencias) que se publica en **GitHub Pages**, gratis. Un robot de GitHub Actions descarga los datos del BOE cada día.

## Publicarla (una sola vez)

1. Crea un repositorio nuevo en GitHub (por ejemplo `oposiciones`) y sube todo este proyecto a la rama `main`.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. En **Settings → Actions → General → Workflow permissions**, marca **Read and write permissions**.
4. Ve a la pestaña **Actions**, elige **Actualizar datos del BOE** y pulsa **Run workflow**. La primera vez rellena unos 6 meses de convocatorias y descarga las normas (tarda unos minutos).
5. Al terminar, el propio robot lanza **Publicar la web**. Tu web quedará en `https://TU-USUARIO.github.io/oposiciones/`.

A partir de ahí el robot se ejecuta cada mañana sin que hagas nada.

## Qué está comprobado y qué no

- La lógica (lectura del sumario del BOE, extracción de convocatorias, fechas de examen, búsqueda, calendario, `.ics`) tiene tests automáticos que se ejecutan en cada cambio: `python -m pytest` y `npm test`.
- **Esos tests usan datos de ejemplo escritos a partir de la documentación del BOE** (<https://www.boe.es/datosabiertos/api/api.php>). El entorno donde se creó el proyecto no podía conectar con el BOE, así que **la primera ejecución real es la prueba definitiva**. Si falla, el log de la pestaña Actions dirá en qué respuesta; lo más probable es ajustar un nombre de campo en `scripts/oposiciones/`.
- Los identificadores BOE de las normas (`site/data/normas.json`) se comprueban al descargar: si el BOE devuelve una norma con otro título, se avisa y no se publica.

## Cómo crece el contenido

| Quieres… | Edita |
|---|---|
| Añadir o corregir una oposición | `site/data/oposiciones.json` |
| Añadir un libro, apuntes o una web a una oposición | campo `recursos` de esa oposición (`titulo`, `url`, `tipo`, `gratuito`) |
| Añadir un examen de una comunidad, ayuntamiento o universidad | `site/data/examenes.json` (`fecha`, `titulo`, `url`, `fuente`) |
| Añadir una norma troncal | `site/data/normas.json` (`slug`, `nombre`, `id` del BOE, `referencia`) |

Los visitantes pueden proponer recursos desde el botón «Aportar…» de cada oposición, que abre una *issue* de GitHub ya rellenada.

## Alcance y límites (importante)

- **Convocatorias automáticas**: solo las del **BOE** (Estado: Administración General, Justicia, Hacienda, Policía, Guardia Civil, etc.). Las de comunidades, ayuntamientos, servicios de salud y universidades se publican en 17 boletines autonómicos y miles de sedes locales; no hay una fuente única, así que esas fechas entran por `examenes.json`.
- **Catálogo**: contiene las oposiciones más habituales (≈60). «TODAS» las de España es inabarcable de golpe porque se convocan miles de plazas distintas cada año; el catálogo está pensado para crecer con aportaciones.
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

Los datos de legislación y sumarios proceden del BOE (Agencia Estatal Boletín Oficial del Estado) y se reutilizan según sus condiciones de reutilización. Elige una licencia para el código (por ejemplo MIT) antes de hacer público el repositorio.
