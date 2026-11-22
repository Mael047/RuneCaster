// =============================================================
// MEJORES PUNTAJES
// Se guardan en el navegador (localStorage), así que cada computador
// y cada navegador tiene su propia tabla. Se guardan solo los 10 mejores.
// =============================================================
const CLAVE = 'runcaster-puntajes';
const CLAVE_NOMBRE = 'runcaster-nombre';   // el último nombre usado, para no escribirlo cada vez
export const MAXIMO = 10;
export const LARGO_NOMBRE = 12;

// Quita espacios de sobra y recorta el nombre
export function limpiarNombre(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, LARGO_NOMBRE);
}

export function leerPuntajes() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE));
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((p) => p && typeof p.nombre === 'string' && Number.isFinite(p.puntaje))
      .slice(0, MAXIMO);
  } catch {
    return [];
  }
}

// Agrega el resultado de una partida.
// Devuelve la tabla y el puesto que sacó (1 a 10), o 0 si no entró.
export function guardarPuntaje({ nombre, puntaje, oleada, modo }) {
  const lista = leerPuntajes();
  const nuevo = { nombre: limpiarNombre(nombre) || 'Mago', puntaje, oleada, modo, fecha: Date.now() };
  // Si empata con alguien, queda debajo de quien llegó primero
  let i = lista.findIndex((p) => puntaje > p.puntaje);
  if (i === -1) i = lista.length;
  if (i >= MAXIMO) return { lista, puesto: 0 };
  lista.splice(i, 0, nuevo);
  if (lista.length > MAXIMO) lista.length = MAXIMO;
  try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch { /* sin espacio o bloqueado */ }
  return { lista, puesto: i + 1 };
}

export function leerNombre() {
  try { return limpiarNombre(localStorage.getItem(CLAVE_NOMBRE)); } catch { return ''; }
}

export function recordarNombre(nombre) {
  try { localStorage.setItem(CLAVE_NOMBRE, nombre); } catch { /* nada */ }
}
