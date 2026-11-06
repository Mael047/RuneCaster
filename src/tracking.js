// =============================================================
// RUNCASTER – módulo de seguimiento (tracking)
// -------------------------------------------------------------
// Responsable: Joan Moreno (visión por computadora)
//
// Hace 3 cosas:
//   1. Enciende la webcam.
//   2. Encuentra UN punto en la imagen, que es la "punta de la varita".
//   3. Filtra ese punto para que no tiemble (filtro One Euro, ver filtro.js).
//
// Hay dos modos. El resto del juego no tiene que saber cuál se usa:
//   - 'mano'  -> MediaPipe detecta la mano y usamos la punta del dedo índice.
//               Sirve mientras no exista la varita física (y es el plan B).
//   - 'color' -> busca los píxeles del color de la bolita de la varita.
//               Es el modo principal según la ficha, para cuando haya varita.
//
// Uso:
//   const tracker = await crearTracker({ video, modo: 'mano' });
//   // en cada cuadro:
//   const punto = tracker.detectar();   // { x, y } entre 0 y 1, o null
//
// Las coordenadas salen "en espejo": si mueves la mano a tu derecha,
// el punto va a la derecha de la pantalla, como en un espejo.
// =============================================================

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { crearFiltroPunto } from './filtro.js';

// Archivos que MediaPipe descarga la primera vez (motor y modelo entrenado)
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODELO_MANO =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// MediaPipe numera 21 puntos de la mano; el 8 es la punta del dedo índice.
const PUNTA_INDICE = 8;

// ---------- 1. WEBCAM ----------
export async function encenderCamara(video) {
  // getUserMedia pide permiso al usuario. Solo funciona en https:// o en localhost.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();
  return stream;
}

// ---------- 2a. MODO MANO (MediaPipe) ----------
// delegado: 'GPU' (tarjeta gráfica, más rápido) o 'CPU' (procesador).
// Si la GPU falla, se cambia sola a la CPU.
async function cargarModeloMano(delegado) {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const opciones = {
    baseOptions: { modelAssetPath: MODELO_MANO, delegate: delegado },
    runningMode: 'VIDEO',
    numHands: 1,
  };
  try {
    return { detector: await HandLandmarker.createFromOptions(vision, opciones), delegado };
  } catch (e) {
    if (delegado === 'CPU') throw e;
    // Algunos computadores no permiten usar la GPU: probamos con el procesador
    console.warn('MediaPipe no pudo usar la GPU, se usa la CPU', e);
    opciones.baseOptions.delegate = 'CPU';
    return { detector: await HandLandmarker.createFromOptions(vision, opciones), delegado: 'CPU' };
  }
}

async function crearDetectorMano(delegado = 'GPU', avisarDelegado = () => {}) {
  let { detector, delegado: actual } = await cargarModeloMano(delegado);
  console.info('MediaPipe usando', actual);
  avisarDelegado(actual);

  let ultimoTiempo = -1;
  let ultimoCuadro = -1;        // tiempo del último cuadro de video analizado
  let ultimoResultado = null;
  let cambiando = false;

  return function detectarMano(video) {
    // La cámara da ~30 imágenes por segundo, pero el juego dibuja ~60.
    // Si la imagen no ha cambiado, devolvemos el resultado anterior
    // en vez de analizar dos veces lo mismo.
    if (video.currentTime === ultimoCuadro || cambiando) return ultimoResultado;
    ultimoCuadro = video.currentTime;

    const ahora = performance.now();
    if (ahora <= ultimoTiempo) return ultimoResultado;   // MediaPipe exige tiempos crecientes
    ultimoTiempo = ahora;

    let resultado;
    try {
      resultado = detector.detectForVideo(video, ahora);
    } catch (e) {
      console.error('Error de MediaPipe al detectar la mano', e);
      if (actual === 'GPU') {
        // Si falla con la GPU, cambiamos a la CPU sin detener el juego
        cambiando = true;
        cargarModeloMano('CPU').then((r) => {
          detector.close?.();
          ({ detector, delegado: actual } = r);
          avisarDelegado(actual);
          cambiando = false;
        });
      }
      return (ultimoResultado = null);
    }
    const mano = resultado.landmarks?.[0];
    if (!mano) return (ultimoResultado = null);
    const punta = mano[PUNTA_INDICE];
    return (ultimoResultado = { x: punta.x, y: punta.y });   // ya vienen entre 0 y 1
  };
}

// ---------- 2b. MODO COLOR (varita con bolita fluorescente) ----------
// Reducimos la imagen a 160x120 para que sea rápido, y buscamos los
// píxeles cuyo color se parece al color objetivo. El punto es el promedio
// (centro) de todos esos píxeles.
function crearDetectorColor(config) {
  const ANCHO = 160, ALTO = 120;
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO; lienzo.height = ALTO;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });

  return function detectarColor(video) {
    ctx.drawImage(video, 0, 0, ANCHO, ALTO);
    const { data } = ctx.getImageData(0, 0, ANCHO, ALTO);
    const objetivo = config.colorHSV;          // { h: 0-360, s: 0-1, v: 0-1 }
    let sumaX = 0, sumaY = 0, cuenta = 0;

    for (let i = 0; i < data.length; i += 4) {
      const { h, s, v } = rgbAHsv(data[i], data[i + 1], data[i + 2]);
      // Comparamos sobre todo el tono (h), que cambia poco con la luz
      let difTono = Math.abs(h - objetivo.h);
      if (difTono > 180) difTono = 360 - difTono;   // el tono es circular
      if (difTono < config.toleranciaTono && s > config.saturacionMin && v > config.brilloMin) {
        const p = i / 4;
        sumaX += p % ANCHO;
        sumaY += Math.floor(p / ANCHO);
        cuenta++;
      }
    }
    if (cuenta < config.pixelesMin) return null;    // muy pocos píxeles = ruido
    return { x: sumaX / cuenta / ANCHO, y: sumaY / cuenta / ALTO };
  };
}

export function rgbAHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

// ---------- 3. TRACKER (une todo) ----------
export async function crearTracker({ video, modo = 'mano', delegado = 'GPU' }) {
  // Ajustes del modo color; se pueden cambiar en vivo desde la página de prueba
  const configColor = {
    colorHSV: { h: 120, s: 1, v: 1 },   // verde fluorescente por defecto
    toleranciaTono: 20,                 // grados de diferencia permitidos
    saturacionMin: 0.45,
    brilloMin: 0.35,
    pixelesMin: 15,
  };

  const detectores = { mano: null, color: crearDetectorColor(configColor) };
  let modoActual = modo;
  // Filtro anti-temblor. frecuenciaMin: menor = más suave en reposo.
  const ajustesFiltro = { frecuenciaMin: 1.2, beta: 4 };
  const filtro = crearFiltroPunto(ajustesFiltro);

  let delegadoReal = null;
  async function usarModo(nuevoModo) {
    if (nuevoModo === 'mano' && !detectores.mano) {
      detectores.mano = await crearDetectorMano(delegado, (d) => (delegadoReal = d));   // se carga solo si se usa
    }
    modoActual = nuevoModo;
    filtro.reiniciar();
  }
  await usarModo(modo);

  return {
    get modo() { return modoActual; },
    get delegado() { return modoActual === 'mano' ? delegadoReal : 'color'; },
    usarModo,
    configColor,
    ajustesFiltro,
    ajustarFiltro(cambios) { Object.assign(ajustesFiltro, cambios); filtro.ajustar(cambios); },

    // Devuelve { x, y } entre 0 y 1 (en espejo), o null si no ve nada
    detectar() {
      if (video.readyState < 2) return null;         // la cámara aún no da imagen
      const crudo = detectores[modoActual](video);
      if (!crudo) { filtro.reiniciar(); return null; }
      return filtro({ x: 1 - crudo.x, y: crudo.y }, performance.now());
    },
  };
}
