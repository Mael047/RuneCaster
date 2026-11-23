// =============================================================
// REGISTRO PARA LAS PRUEBAS DE USUARIO (los jugadores no lo ven)
// -------------------------------------------------------------
// Guarda en el navegador (localStorage) datos de cada SESIÓN (cada vez
// que se abre la página) y de cada PARTIDA, para la evaluación del
// proyecto. Se consultan abriendo registro.html en el mismo navegador
// y en la misma dirección donde se jugó.
//
// Métricas:
//   Efectividad   % de runas reconocidas (reconocidas ÷ intentos)
//                 % de cuadros en que la cámara detecta la varita (y la mano)
//                 si completó un nivel (superó al menos una oleada)
//   Eficiencia    tiempo de carga de la página
//                 retraso gesto -> respuesta en pantalla (ms)
//                 % de ataques que usaron el lock-on (tenían enemigo al que apuntar)
//                 intentos promedio para lograr una runa válida
//   Seguridad     crasheos por sesión, errores registrados (cámara, detección…)
//   Fácil de aprender  tiempo hasta la primera runa exitosa
// =============================================================

const CLAVE = 'runcaster-registro';
const MAX_SESIONES = 300;
const MAX_MUESTRAS = 300;   // retrasos guardados uno a uno por partida (para revisar)

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function leerRegistro() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d && Array.isArray(d.sesiones)) return d;
  } catch { /* datos dañados: se empieza de cero */ }
  return { version: 1, sesiones: [] };
}

export function escribirRegistro(d) {
  d.sesiones.sort((a, b) => a.inicio - b.inicio);
  if (d.sesiones.length > MAX_SESIONES) d.sesiones.splice(0, d.sesiones.length - MAX_SESIONES);
  try { localStorage.setItem(CLAVE, JSON.stringify(d)); return true; } catch { return false; }
}

export function borrarRegistro() {
  try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
}

// ---------- Sesión actual ----------
// Solo se crea al importar este archivo desde el juego (no desde registro.html)
let sesion = null;
let partida = null;
let temporizador = null;

export function iniciarSesion() {
  sesion = {
    id: nuevoId(),
    inicio: Date.now(),
    navegador: navigator.userAgent,
    pantalla: `${innerWidth}x${innerHeight}`,
    cargaMs: null,          // tiempo hasta que se puede pulsar "comenzar"
    crasheos: 0,            // fallos graves distintos (el juego deja de funcionar bien)
    errores: [],            // { tipo, mensaje, grave, veces, primera }
    partidas: [],
  };
  guardarYa();
  // Al cerrar o recargar la página se guarda lo que haya
  addEventListener('pagehide', () => {
    if (partida) cerrarPartida('cerró la página');
    guardarYa();
  });
}

// Guarda leyendo antes lo que hay (por si hay otra pestaña o se borró desde registro.html)
function guardarYa() {
  clearTimeout(temporizador);
  temporizador = null;
  if (!sesion) return;
  const d = leerRegistro();
  const i = d.sesiones.findIndex((s) => s.id === sesion.id);
  if (i >= 0) d.sesiones[i] = sesion; else d.sesiones.push(sesion);
  escribirRegistro(d);
}
function guardarLuego() {
  if (!temporizador) temporizador = setTimeout(guardarYa, 2000);
}

// ---------- Eventos que manda el juego ----------
export function marcarCarga(ms) {
  if (!sesion) return;
  sesion.cargaMs = Math.round(ms);
  guardarYa();
}

// tipo: 'cámara', 'detección', 'juego', 'dibujo', 'global'…
// Un mismo error repetido (por ejemplo, en cada cuadro) cuenta una sola vez.
export function registrarError(tipo, error, grave = false) {
  if (!sesion) return;
  const mensaje = String(error?.message || error || 'error desconocido').slice(0, 300);
  const previo = sesion.errores.find((e) => e.tipo === tipo && e.mensaje === mensaje);
  if (previo) { previo.veces++; return guardarLuego(); }
  sesion.errores.push({ tipo, mensaje, grave, veces: 1, primera: Date.now() });
  if (grave) sesion.crasheos++;
  guardarYa();
}

export function empezarPartida({ jugador, modo }) {
  if (!sesion) return;
  if (partida) cerrarPartida('abandonó');
  partida = {
    id: nuevoId(),
    inicio: Date.now(),
    fin: null,
    jugador,
    modos: [modo],
    resultado: 'en curso',   // 'perdió' | 'abandonó' | 'cerró la página'
    segundosJugados: 0,      // tiempo de juego sin contar las pausas
    puntaje: 0,
    oleada: 1,
    oleadasSuperadas: 0,
    trazos: 0,               // intentos de runa (sin contar movimientos diminutos)
    reconocidas: 0,
    porRuna: { circulo: 0, linea: 0, triangulo: 0 },
    intentosPorRuna: [],     // cuántos intentos tomó cada runa válida
    intentosActuales: 0,
    primeraRunaS: null,      // segundos de juego hasta la primera runa reconocida
    ataques: 0,              // hechizos lanzados con runas
    conLockOn: 0,            // de esos, cuántos tenían un enemigo al que apuntar
    ataquesTeclado: 0,       // teclas 1, 2, 3 (solo para pruebas; no cuentan)
    retraso: { n: 0, suma: 0, max: 0, muestras: [] },   // ms gesto -> pantalla
    cuadros: { camara: { total: 0, detectados: 0 }, color: { total: 0, detectados: 0 } },
  };
  sesion.partidas.push(partida);
  guardarYa();
}

export function cambiarModo(modo) {
  if (partida && partida.modos.at(-1) !== modo) { partida.modos.push(modo); guardarLuego(); }
}

export function sumarTiempo(segundos) {
  if (partida) partida.segundosJugados += segundos;
}

// Un cuadro de la cámara durante la partida: ¿se vio la mano / la varita?
export function cuadroCamara(modo, detectado) {
  const c = partida?.cuadros[modo];
  if (!c) return;
  c.total++;
  if (detectado) c.detectados++;
  if (c.total % 120 === 0) guardarLuego();
}

export function trazo(runa) {
  if (!partida) return;
  partida.trazos++;
  partida.intentosActuales++;
  if (runa) {
    partida.reconocidas++;
    partida.porRuna[runa] = (partida.porRuna[runa] || 0) + 1;
    partida.intentosPorRuna.push(partida.intentosActuales);
    partida.intentosActuales = 0;
    if (partida.primeraRunaS === null) partida.primeraRunaS = +partida.segundosJugados.toFixed(2);
  }
  guardarLuego();
}

export function ataque({ lockOn, teclado }) {
  if (!partida) return;
  if (teclado) { partida.ataquesTeclado++; return; }
  partida.ataques++;
  if (lockOn) partida.conLockOn++;
}

export function respuesta(ms) {
  if (!partida) return;
  const r = partida.retraso;
  r.n++;
  r.suma += ms;
  r.max = Math.max(r.max, ms);
  if (r.muestras.length < MAX_MUESTRAS) r.muestras.push(Math.round(ms));
}

export function oleadaSuperada() {
  if (!partida) return;
  partida.oleadasSuperadas++;
  guardarYa();
}

export function actualizarMarcador({ puntaje, oleada }) {
  if (!partida) return;
  partida.puntaje = puntaje;
  partida.oleada = oleada;
}

export function terminarPartida(resultado, marcador) {
  if (!partida) return;
  if (marcador) actualizarMarcador(marcador);
  cerrarPartida(resultado);
  guardarYa();
}

function cerrarPartida(resultado) {
  partida.resultado = resultado;
  partida.fin = Date.now();
  partida.segundosJugados = +partida.segundosJugados.toFixed(2);
  partida.retraso.suma = Math.round(partida.retraso.suma);
  partida.retraso.max = Math.round(partida.retraso.max);
  partida = null;
}

// =============================================================
// CÁLCULO DE LAS MÉTRICAS Y PUNTAJES (1 a 5), según la tabla de evaluación
// =============================================================
const porcentaje = (v) => (v >= 90 ? 5 : v >= 75 ? 4 : v >= 60 ? 3 : v >= 40 ? 2 : 1);

export const METRICAS = [
  { id: 'runas', categoria: 'Efectividad', nombre: '% de runas detectadas correctamente',
    detalle: 'runas reconocidas ÷ intentos', unidad: '%',
    escala: '≥90 = 5 · 75–89 = 4 · 60–74 = 3 · 40–59 = 2 · <40 = 1', calificar: porcentaje },
  { id: 'deteccionVarita', categoria: 'Efectividad', nombre: '% de cuadros en que la cámara detecta la varita',
    detalle: 'solo modo varita', unidad: '%',
    escala: '≥90 = 5 · 75–89 = 4 · 60–74 = 3 · 40–59 = 2 · <40 = 1', calificar: porcentaje },
  { id: 'deteccionMano', categoria: 'Efectividad', nombre: '% de cuadros en que la cámara detecta la mano',
    detalle: 'solo modo cámara (dato extra, misma escala)', unidad: '%',
    escala: '≥90 = 5 · 75–89 = 4 · 60–74 = 3 · 40–59 = 2 · <40 = 1', calificar: porcentaje },
  { id: 'nivel', categoria: 'Efectividad', nombre: 'El usuario logró completar un nivel',
    detalle: 'superó al menos una oleada', unidad: '',
    escala: 'completó = 5 · no = 1', calificar: (v) => (v ? 5 : 1) },
  { id: 'carga', categoria: 'Eficiencia', nombre: 'Tiempo de carga de la página',
    detalle: 'hasta que se puede pulsar "comenzar"', unidad: 's', porSesion: true,
    escala: '<3 = 5 · 3–4 = 4 · 4–8 = 3 · 8–12 = 2 · >12 = 1',
    calificar: (v) => (v < 3 ? 5 : v < 4 ? 4 : v <= 8 ? 3 : v <= 12 ? 2 : 1) },
  { id: 'retraso', categoria: 'Eficiencia', nombre: 'Retraso gesto → respuesta en pantalla',
    detalle: 'desde que termina el gesto (con cámara: desde que la mano o varita se detiene) hasta que se dibuja la respuesta', unidad: 'ms',
    escala: '<100 = 5 · 100–200 = 4 · 200–300 = 3 · 300–500 = 2 · >500 = 1',
    calificar: (v) => (v < 100 ? 5 : v <= 200 ? 4 : v <= 300 ? 3 : v <= 500 ? 2 : 1) },
  { id: 'lockOn', categoria: 'Eficiencia', nombre: '% de ataques en los que se usó el lock-on',
    detalle: 'hechizos que encontraron un enemigo de su tipo', unidad: '%',
    escala: '≥90 = 5 · 75–89 = 4 · 60–74 = 3 · 40–59 = 2 · <40 = 1', calificar: porcentaje },
  { id: 'intentos', categoria: 'Eficiencia', nombre: 'Intentos promedio para lograr una runa válida',
    detalle: 'trazos que toma cada runa reconocida', unidad: '',
    escala: '1 = 5 · 2 = 4 · 3 = 3 · 4 = 2 · 5+ = 1',
    calificar: (v) => (v < 1.5 ? 5 : v < 2.5 ? 4 : v < 3.5 ? 3 : v < 4.5 ? 2 : 1) },
  { id: 'crasheos', categoria: 'Seguridad', nombre: 'Crasheos por sesión',
    detalle: 'fallos graves del juego o del dibujo', unidad: '', porSesion: true,
    escala: '0 = 5 · 1 = 3 · 2+ = 1', calificar: (v) => (v < 0.5 ? 5 : v < 1.5 ? 3 : 1) },
  { id: 'errores', categoria: 'Seguridad', nombre: 'Errores o excepciones registradas',
    detalle: 'cámara, detección y demás, por sesión', unidad: '', porSesion: true,
    escala: '0 = 5 · 1–2 = 4 · 3–5 = 3 · 6–10 = 2 · >10 = 1',
    calificar: (v) => (v < 0.5 ? 5 : v <= 2 ? 4 : v <= 5 ? 3 : v <= 10 ? 2 : 1) },
  { id: 'primeraRuna', categoria: 'Fácil de aprender', nombre: 'Tiempo hasta la primera runa exitosa',
    detalle: 'segundos de juego (sin pausas)', unidad: 's',
    escala: '<30 = 5 · 30–60 = 4 · 60–90 = 3 · 90–120 = 2 · >120 = 1',
    calificar: (v) => (v < 30 ? 5 : v <= 60 ? 4 : v <= 90 ? 3 : v <= 120 ? 2 : 1) },
];

const pct = (a, b) => (b > 0 ? (a / b) * 100 : null);
const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Valores de una partida (null = no aplica, por ejemplo detección en modo mouse)
export function valoresPartida(p) {
  const c = p.cuadros || {};
  return {
    runas: pct(p.reconocidas, p.trazos),
    deteccionVarita: pct(c.color?.detectados, c.color?.total),
    deteccionMano: pct(c.camara?.detectados, c.camara?.total),
    nivel: (p.oleadasSuperadas || 0) > 0,
    retraso: p.retraso?.n ? p.retraso.suma / p.retraso.n : null,
    lockOn: pct(p.conLockOn, p.ataques),
    intentos: promedio(p.intentosPorRuna || []),
    primeraRuna: p.primeraRunaS,
  };
}

export function valoresSesion(s) {
  return {
    carga: s.cargaMs != null ? s.cargaMs / 1000 : null,
    crasheos: s.crasheos || 0,
    errores: (s.errores || []).length,
  };
}

// Resumen de varias sesiones/partidas: un valor y un puntaje por métrica.
// Los porcentajes se calculan juntando todos los cuadros/trazos (no promediando partidas).
export function resumir(sesiones, partidas) {
  const suma = (f) => partidas.reduce((a, p) => a + (f(p) || 0), 0);
  const r = {};
  const poner = (id, valor, n, nota = '') => {
    const m = METRICAS.find((x) => x.id === id);
    r[id] = { valor, n, nota, puntaje: valor == null ? null : m.calificar(valor) };
  };
  poner('runas', pct(suma((p) => p.reconocidas), suma((p) => p.trazos)),
    partidas.filter((p) => p.trazos).length, `${suma((p) => p.reconocidas)} de ${suma((p) => p.trazos)} trazos`);
  poner('deteccionVarita', pct(suma((p) => p.cuadros?.color?.detectados), suma((p) => p.cuadros?.color?.total)),
    partidas.filter((p) => p.cuadros?.color?.total).length);
  poner('deteccionMano', pct(suma((p) => p.cuadros?.camara?.detectados), suma((p) => p.cuadros?.camara?.total)),
    partidas.filter((p) => p.cuadros?.camara?.total).length);
  const completas = partidas.filter((p) => p.oleadasSuperadas > 0).length;
  r.nivel = {
    valor: partidas.length ? (completas / partidas.length) * 100 : null, n: partidas.length,
    nota: `${completas} de ${partidas.length} partidas`,
    puntaje: partidas.length ? promedio(partidas.map((p) => (p.oleadasSuperadas > 0 ? 5 : 1))) : null,
  };
  const conCarga = sesiones.filter((s) => s.cargaMs != null);
  poner('carga', promedio(conCarga.map((s) => s.cargaMs / 1000)), conCarga.length);
  const nRetrasos = suma((p) => p.retraso?.n);
  poner('retraso', nRetrasos ? suma((p) => p.retraso?.suma) / nRetrasos : null,
    partidas.filter((p) => p.retraso?.n).length, `${nRetrasos} respuestas medidas`);
  poner('lockOn', pct(suma((p) => p.conLockOn), suma((p) => p.ataques)),
    partidas.filter((p) => p.ataques).length, `${suma((p) => p.conLockOn)} de ${suma((p) => p.ataques)} ataques`);
  poner('intentos', promedio(partidas.flatMap((p) => p.intentosPorRuna || [])),
    partidas.filter((p) => p.intentosPorRuna?.length).length);
  poner('crasheos', sesiones.length ? promedio(sesiones.map((s) => s.crasheos || 0)) : null, sesiones.length);
  poner('errores', sesiones.length ? promedio(sesiones.map((s) => (s.errores || []).length)) : null, sesiones.length);
  const conPrimera = partidas.filter((p) => p.primeraRunaS != null);
  const sinRuna = partidas.filter((p) => p.primeraRunaS == null && p.segundosJugados > 0).length;
  poner('primeraRuna', promedio(conPrimera.map((p) => p.primeraRunaS)), conPrimera.length,
    sinRuna ? `${sinRuna} partida(s) sin ninguna runa exitosa` : '');
  return r;
}
