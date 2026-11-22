// Tema claro/oscuro: sigue al sistema hasta que la persona elige; la elección se recuerda.
const raiz = document.documentElement;
const boton = document.getElementById("boton-tema");
const sistema = matchMedia("(prefers-color-scheme: dark)");

const actual = () => raiz.dataset.tema ?? (sistema.matches ? "oscuro" : "claro");

function pintar() {
  if (!boton) return;
  const oscuro = actual() === "oscuro";
  boton.textContent = oscuro ? "☀" : "☾";
  boton.setAttribute("aria-label", oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  boton.title = boton.getAttribute("aria-label");
}

boton?.addEventListener("click", () => {
  const nuevo = actual() === "oscuro" ? "claro" : "oscuro";
  raiz.dataset.tema = nuevo;
  try { localStorage.setItem("tema", nuevo); } catch { /* sin almacenamiento */ }
  pintar();
});
sistema.addEventListener("change", pintar);
pintar();
