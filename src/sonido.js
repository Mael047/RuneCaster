// =============================================================
// RUNCASTER – sonido
// -------------------------------------------------------------
// Responsable: Katalina (diseño sonoro)
//
// Usa la Web Audio API: cada sonido se carga una vez y luego se puede
// reproducir muchas veces a la vez (por ejemplo, varios enemigos que
// aparecen seguidos) sin cortarse.
//
// Sonidos (la lista y los archivos están en SONIDOS, abajo):
//   ambiente  -> música de fondo, en bucle todo el tiempo
//   orco, cangrejo, demonio -> cuando aparece ese enemigo
//   dibujar   -> mientras se dibuja una runa (se corta al terminar el trazo)
//   acierto   -> cuando la runa es correcta y el hechizo mata al enemigo
//
// Los navegadores no dejan sonar nada hasta que la persona hace clic o
// toca una tecla. Por eso prepararAudio() carga todo apenas abre la página
// y deja la ambientación lista: empieza a sonar con el primer clic o tecla
// en cualquier parte (o de inmediato, si el navegador ya lo permite).
// Tecla M: silenciar / activar el sonido (se recuerda para la próxima vez).
// Los botones hacen un "blip" retro generado con código (sonarBoton()).
// =============================================================

// Archivo y volumen de cada sonido. Si un archivo falta, ese sonido
// simplemente no suena; el juego sigue normal.
//   volumen: 1 = como viene el archivo (puede ser mayor que 1 para subirlo)
//   inicio / duracion (segundos): usar solo un fragmento del archivo
//   bucleInicio / bucleFin: tramo que se repite mientras suena (dibujar)
export const SONIDOS = {
  // 49,5 s; cada vuelta se funde con la siguiente (ver FUNDIDO_AMBIENTE)
  ambiente: { archivo: 'sonidos/ambientacion/ambientacion.mp3', volumen: 0.3 },
  // Enemigos: enemigo1 y enemigo3 repiten su sonido varias veces; se usa el primero
  orco:     { archivo: 'sonidos/enemigos/enemigo2.mp3', volumen: 0.8 },
  cangrejo: { archivo: 'sonidos/enemigos/enemigo1.mp3', volumen: 0.6, inicio: 0.25, duracion: 0.7 },
  demonio:  { archivo: 'sonidos/enemigos/enemigo3.mp3', volumen: 0.9, inicio: 0, duracion: 1.15 },
  // La grabación de la varita es muy baja y tiene pausas: se usa el tramo
  // continuo de 16,7 s a 28,7 s, repetido mientras dure el trazo, y se sube el volumen
  dibujar:  { archivo: 'sonidos/varita/varitaruna.mp3', volumen: 6, bucleInicio: 16.7, bucleFin: 28.7 },
  acierto:  { archivo: 'sonidos/varita/varitaataque.mp3', volumen: 0.55 },
};

// Segundos en que el final de la ambientación se funde con el inicio de la
// siguiente vuelta (el archivo termina con un desvanecido de ~1,5 s)
const FUNDIDO_AMBIENTE = 1.8;

const CLAVE_SILENCIO = 'runcaster-silencio';
const CLAVE_VOLUMEN = 'runcaster-volumen';

// Volúmenes que elige el jugador en Configuración (0 a 1). Se guardan en el navegador.
const volumenes = { ambiente: 0.8, efectos: 0.8 };
try { Object.assign(volumenes, JSON.parse(localStorage.getItem(CLAVE_VOLUMEN)) || {}); } catch { /* sin almacenamiento */ }
// El oído percibe el volumen de forma no lineal: elevar al cuadrado hace que
// el deslizador se sienta parejo (50% suena como "la mitad").
const ganancia = (v) => v * v;

let ctx = null;            // AudioContext (se crea al primer clic)
let general = null;        // volumen general (silencio = 0)
let canalAmbiente = null;  // volumen de la música (se baja en la pausa)
let volAmbiente = null;    // volumen de la música elegido en Configuración
let canalEfectos = null;   // volumen de los efectos elegido en Configuración
const buffers = {};        // sonidos ya cargados
let fuenteAmbiente = null;
let fuenteDibujo = null;   // el sonido de dibujar que está sonando
let silenciado = false;
try { silenciado = localStorage.getItem(CLAVE_SILENCIO) === '1'; } catch { /* sin almacenamiento */ }

async function cargar(nombre) {
  const { archivo } = SONIDOS[nombre];
  try {
    const respuesta = await fetch(archivo);
    if (!respuesta.ok) throw new Error(respuesta.status + ' ' + archivo);
    buffers[nombre] = await ctx.decodeAudioData(await respuesta.arrayBuffer());
  } catch (e) {
    console.warn(`Sonido "${nombre}" no disponible:`, e.message || e);
  }
}

// Llamar al abrir la página. Carga los sonidos y programa la ambientación.
// alCambiarEstado(bloqueado) avisa si el navegador todavía no deja sonar.
export async function prepararAudio(alCambiarEstado = () => {}) {
  if (ctx) return;
  const Contexto = window.AudioContext || window.webkitAudioContext;
  if (!Contexto) return;                        // navegador sin audio
  ctx = new Contexto();
  general = ctx.createGain();
  general.gain.value = silenciado ? 0 : 1;
  general.connect(ctx.destination);
  // Música: canalAmbiente (baja en la pausa) -> volAmbiente (Configuración) -> general
  volAmbiente = ctx.createGain();
  volAmbiente.gain.value = ganancia(volumenes.ambiente);
  volAmbiente.connect(general);
  canalAmbiente = ctx.createGain();
  canalAmbiente.connect(volAmbiente);
  // Efectos: enemigos, dibujar, acierto y botones -> canalEfectos -> general
  canalEfectos = ctx.createGain();
  canalEfectos.gain.value = ganancia(volumenes.efectos);
  canalEfectos.connect(general);

  const avisar = () => alCambiarEstado(ctx.state !== 'running');
  ctx.addEventListener?.('statechange', avisar);
  // Con el primer clic o tecla en cualquier parte, el audio se desbloquea
  const desbloquear = () => {
    ctx.resume().then(avisar);
    if (ctx.state === 'running') {
      removeEventListener('pointerdown', desbloquear, true);
      removeEventListener('keydown', desbloquear, true);
    }
  };
  addEventListener('pointerdown', desbloquear, true);
  addEventListener('keydown', desbloquear, true);
  ctx.resume().catch(() => {});                 // por si el navegador ya lo permite
  avisar();

  await Promise.all(Object.keys(SONIDOS).map(cargar));
  iniciarAmbiente();
}

// Asegura que el audio esté activo (llamar desde un clic)
export function activar() { ctx?.resume(); }

// Bucle con fundido: cada vuelta empieza un poco antes de que termine la
// anterior; una sube de volumen mientras la otra baja, y no se nota el corte.
let proximaVuelta = 0;
function programarVueltaAmbiente(cuando, primera = false) {
  const buffer = buffers.ambiente, dur = buffer.duration, vol = SONIDOS.ambiente.volumen;
  const fuente = ctx.createBufferSource();
  fuente.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, cuando);
  g.gain.linearRampToValueAtTime(vol, cuando + (primera ? 2.5 : FUNDIDO_AMBIENTE));
  g.gain.setValueAtTime(vol, cuando + dur - FUNDIDO_AMBIENTE);
  g.gain.linearRampToValueAtTime(0, cuando + dur);
  fuente.connect(g).connect(canalAmbiente);
  fuente.start(cuando);
  fuente.stop(cuando + dur);
  proximaVuelta = cuando + dur - FUNDIDO_AMBIENTE;
}

function iniciarAmbiente() {
  if (!buffers.ambiente || fuenteAmbiente) return;
  fuenteAmbiente = true;
  programarVueltaAmbiente(ctx.currentTime + 0.05, true);
  // Revisa cada medio segundo si ya toca programar la siguiente vuelta
  setInterval(() => {
    if (ctx.currentTime > proximaVuelta - 2) programarVueltaAmbiente(proximaVuelta);
  }, 500);
}

// Reproduce un sonido una vez. `variacion` cambia un poco el tono cada vez,
// para que un sonido repetido (enemigos) no suene idéntico.
export function reproducir(nombre, { variacion = 0, volumen = 1 } = {}) {
  if (!ctx || !buffers[nombre]) return null;
  const conf = SONIDOS[nombre];
  const fuente = ctx.createBufferSource();
  fuente.buffer = buffers[nombre];
  if (variacion) fuente.playbackRate.value = 1 + (Math.random() * 2 - 1) * variacion;
  const g = ctx.createGain();
  const vol = conf.volumen * volumen, ahora = ctx.currentTime;
  g.gain.setValueAtTime(vol, ahora);
  fuente.connect(g).connect(canalEfectos);
  if (conf.bucleFin) {
    // Sonido que se repite (dibujar): empieza en su tramo y lo repite
    fuente.loop = true;
    fuente.loopStart = conf.bucleInicio;
    fuente.loopEnd = conf.bucleFin;
    g.gain.setValueAtTime(0, ahora);
    g.gain.linearRampToValueAtTime(vol, ahora + 0.08);
    fuente.start(ahora, conf.bucleInicio);
  } else if (conf.duracion) {
    // Solo un fragmento del archivo, con un final suave
    const dur = conf.duracion / fuente.playbackRate.value;
    g.gain.setValueAtTime(vol, ahora + Math.max(0, dur - 0.1));
    g.gain.linearRampToValueAtTime(0, ahora + dur);
    fuente.start(ahora, conf.inicio || 0, conf.duracion);
  } else {
    fuente.start();
  }
  return { fuente, g };
}

// ---------- Sonido de dibujar ----------
// Empieza con el trazo y se apaga suavemente cuando el trazo termina.
export function empezarDibujo() {
  terminarDibujo();
  fuenteDibujo = reproducir('dibujar');
}

export function terminarDibujo() {
  if (!fuenteDibujo || !ctx) return;
  const { fuente, g } = fuenteDibujo;
  const ahora = ctx.currentTime;
  g.gain.setValueAtTime(g.gain.value, ahora);
  g.gain.linearRampToValueAtTime(0, ahora + 0.15);
  try { fuente.stop(ahora + 0.16); } catch { /* ya terminó */ }
  fuenteDibujo = null;
}

// ---------- Pausa y silencio ----------
// En la pausa la música baja y no se corta.
export function musicaBaja(baja) {
  if (!ctx) return;
  canalAmbiente.gain.setTargetAtTime(baja ? 0.35 : 1, ctx.currentTime, 0.15);
}

export function alternarSilencio() {
  silenciado = !silenciado;
  try { localStorage.setItem(CLAVE_SILENCIO, silenciado ? '1' : '0'); } catch { /* sin almacenamiento */ }
  if (ctx) general.gain.setTargetAtTime(silenciado ? 0 : 1, ctx.currentTime, 0.05);
  return silenciado;
}

export function estaSilenciado() { return silenciado; }

// ---------- Volúmenes de Configuración ----------
// tipo: 'ambiente' o 'efectos'; valor entre 0 y 1
export function fijarVolumen(tipo, valor) {
  volumenes[tipo] = Math.min(1, Math.max(0, valor));
  try { localStorage.setItem(CLAVE_VOLUMEN, JSON.stringify(volumenes)); } catch { /* sin almacenamiento */ }
  const nodo = tipo === 'ambiente' ? volAmbiente : canalEfectos;
  if (ctx && nodo) nodo.gain.setTargetAtTime(ganancia(volumenes[tipo]), ctx.currentTime, 0.03);
}

export function leerVolumen(tipo) { return volumenes[tipo]; }

// ---------- Sonido de los botones ----------
// Un "blip" corto de 8 bits hecho con un oscilador (no necesita archivo).
// Para usar un archivo en su lugar, agrégalo a SONIDOS con el nombre 'boton'.
export function sonarBoton() {
  if (!ctx || ctx.state !== 'running') return;
  if (buffers.boton) { reproducir('boton'); return; }
  const ahora = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(520, ahora);
  osc.frequency.exponentialRampToValueAtTime(1040, ahora + 0.06);   // sube: suena "positivo"
  g.gain.setValueAtTime(0.0001, ahora);
  g.gain.exponentialRampToValueAtTime(0.12, ahora + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.11);
  osc.connect(g).connect(canalEfectos);
  osc.start(ahora);
  osc.stop(ahora + 0.12);
}
