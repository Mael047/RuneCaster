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

// ---------- 2b. MODO COLOR (varita con punta de color) ----------
// Reducimos la imagen a 160x120 para que sea rápido y marcamos los píxeles
// cuyo color se parece al color elegido. Para que un objeto del fondo con
// un color parecido no "jale" el punto, buscamos la zona con MÁS píxeles
// marcados (en una cuadrícula) y promediamos solo los píxeles cercanos a ella.
// Si en el cuadro anterior ya veíamos la varita, preferimos la zona más
// cercana a esa posición: la varita se mueve poco entre un cuadro y otro,
// mientras que un objeto del fondo está en otro lugar.
export const ANCHO_COLOR = 160, ALTO_COLOR = 120;
const CELDA = 8;   // tamaño de cada celda de la cuadrícula, en píxeles

function crearDetectorColor(config) {
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO_COLOR; lienzo.height = ALTO_COLOR;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  const columnas = ANCHO_COLOR / CELDA, filas = ALTO_COLOR / CELDA;
  const celdas = new Uint16Array(columnas * filas);
  // Máscara: 1 donde el píxel se parece al color (la usa la pantalla de calibración)
  config.mascara = new Uint8Array(ANCHO_COLOR * ALTO_COLOR);
  let ultimoCuadro = -1, ultimoResultado = null;

  return function detectarColor(video) {
    if (video.currentTime === ultimoCuadro) return ultimoResultado;   // misma imagen
    ultimoCuadro = video.currentTime;

    ctx.drawImage(video, 0, 0, ANCHO_COLOR, ALTO_COLOR);
    const { data } = ctx.getImageData(0, 0, ANCHO_COLOR, ALTO_COLOR);
    const objetivo = config.colorHSV;          // { h: 0-360, s: 0-1, v: 0-1 }
    const mascara = config.mascara;
    celdas.fill(0);
    let total = 0;

    // 1. Marcar los píxeles del color buscado
    for (let p = 0, i = 0; p < mascara.length; p++, i += 4) {
      const { h, s, v } = rgbAHsv(data[i], data[i + 1], data[i + 2]);
      // Comparamos sobre todo el tono (h), que cambia poco con la luz
      let difTono = Math.abs(h - objetivo.h);
      if (difTono > 180) difTono = 360 - difTono;   // el tono es circular
      const coincide = difTono < config.toleranciaTono && s > config.saturacionMin && v > config.brilloMin;
      mascara[p] = coincide ? 1 : 0;
      if (coincide) {
        total++;
        const x = p % ANCHO_COLOR, y = (p / ANCHO_COLOR) | 0;
        celdas[((y / CELDA) | 0) * columnas + ((x / CELDA) | 0)]++;
      }
    }

    // 2. La mejor celda: la que tiene más píxeles marcados, con ventaja para
    //    las que están cerca de donde estaba la varita en el cuadro anterior
    let mejor = -1, mejorPuntaje = 0;
    for (let c = 0; c < celdas.length; c++) {
      if (celdas[c] < 3) continue;
      let puntaje = celdas[c];
      if (ultimoResultado) {
        const dx = ((c % columnas) + 0.5) / columnas - ultimoResultado.x;
        const dy = (((c / columnas) | 0) + 0.5) / filas - ultimoResultado.y;
        if (Math.hypot(dx, dy) < 0.15) puntaje *= 4;
      }
      if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = c; }
    }
    config.pixelesFuera = total;          // se corrige abajo si hay detección
    if (mejor < 0) return (ultimoResultado = null);
    const cx = (mejor % columnas) * CELDA + CELDA / 2;
    const cy = ((mejor / columnas) | 0) * CELDA + CELDA / 2;

    // 3. Promediar solo los píxeles marcados cerca de esa celda
    const radio = CELDA * 2.5;
    let sumaX = 0, sumaY = 0, cuenta = 0;
    for (let y = Math.max(0, cy - radio | 0); y < Math.min(ALTO_COLOR, cy + radio); y++) {
      for (let x = Math.max(0, cx - radio | 0); x < Math.min(ANCHO_COLOR, cx + radio); x++) {
        if (mascara[y * ANCHO_COLOR + x]) { sumaX += x; sumaY += y; cuenta++; }
      }
    }
    config.pixelesFuera = total - cuenta;  // píxeles del color que NO son la varita
    if (cuenta < config.pixelesMin) return (ultimoResultado = null);   // muy pocos = ruido
    return (ultimoResultado = { x: (sumaX / cuenta + 0.5) / ANCHO_COLOR, y: (sumaY / cuenta + 0.5) / ALTO_COLOR });
  };
}

// ---------- Cuentagotas ----------
// Lee el color promedio de un cuadrito de la cámara alrededor de (x, y).
// x, y entre 0 y 1, en coordenadas de PANTALLA (el video se ve en espejo).
export function leerColor(video, x, y) {
  const lienzo = document.createElement('canvas');
  lienzo.width = video.videoWidth; lienzo.height = video.videoHeight;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0);
  const px = Math.round((1 - x) * lienzo.width);          // deshacer el espejo
  const py = Math.round(y * lienzo.height);
  const lado = 7;
  const { data } = ctx.getImageData(
    Math.min(Math.max(0, px - 3), lienzo.width - lado),
    Math.min(Math.max(0, py - 3), lienzo.height - lado), lado, lado);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  const n = data.length / 4;
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  return { r, g, b, hsv: rgbAHsv(r, g, b) };
}

// Ajusta la detección al color elegido. Los mínimos de saturación y brillo
// se calculan a partir del color, para que funcione también con colores
// menos intensos que un fluorescente.
export function fijarColor(configColor, hsv) {
  configColor.colorHSV = hsv;
  configColor.saturacionMin = Math.max(0.25, hsv.s * 0.6);
  configColor.brilloMin = Math.max(0.2, hsv.v * 0.45);
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
    toleranciaTono: 12,                 // grados de diferencia permitidos
    saturacionMin: 0.45,
    brilloMin: 0.35,
    pixelesMin: 6,                      // mínimo de píxeles para aceptar la detección
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
