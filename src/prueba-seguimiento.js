// =============================================================
// Página de prueba del seguimiento (hipótesis H1)
// Muestra el video, el punto detectado y un rastro luminoso,
// y mide en qué porcentaje de cuadros se detecta el punto.
// =============================================================

import { encenderCamara, crearTracker, rgbAHsv } from './tracking.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const lienzo = $('trazo');
const ctx = lienzo.getContext('2d');

let tracker = null;
const rastro = [];            // últimos puntos detectados
let largoRastro = 25;

// Contadores para la prueba
let cuadros = 0, detectados = 0;
let cuadrosSeg = 0, ultimoSeg = performance.now();

// ---------- Inicio ----------
$('empezar').addEventListener('click', async () => {
  $('empezar').disabled = true;
  $('error').textContent = '';
  try {
    $('estado').textContent = 'Pidiendo permiso para la cámara…';
    await encenderCamara(video);
    $('estado').textContent = 'Cargando el modelo de la mano (la primera vez tarda unos segundos)…';
    tracker = await crearTracker({ video, modo: 'mano' });
    $('inicio').remove();
    ajustarLienzo();
    requestAnimationFrame(bucle);
  } catch (e) {
    console.error(e);
    $('empezar').disabled = false;
    $('estado').textContent = '';
    $('error').textContent = e.name === 'NotAllowedError'
      ? 'No se dio permiso para usar la cámara. Revisa el ícono de cámara en la barra de direcciones.'
      : e.name === 'NotFoundError'
        ? 'No se encontró ninguna cámara conectada.'
        : 'Algo falló: ' + e.message + ' (¿abriste la página con Live Server o con https?)';
  }
});

// ---------- Bucle ----------
function bucle() {
  const punto = tracker.detectar();
  cuadros++;
  if (punto) {
    detectados++;
    rastro.push(punto);
  } else if (rastro.length) {
    rastro.shift();           // si se pierde el punto, el rastro se va borrando
  }
  while (rastro.length > largoRastro) rastro.shift();

  dibujar(punto);
  actualizarStats();
  requestAnimationFrame(bucle);
}

function dibujar(punto) {
  const w = lienzo.width, h = lienzo.height;
  ctx.clearRect(0, 0, w, h);

  // Rastro: segmentos cada vez más gruesos y opacos hacia la punta
  ctx.lineCap = 'round';
  for (let i = 1; i < rastro.length; i++) {
    const t = i / rastro.length;
    ctx.strokeStyle = `rgba(120, 220, 255, ${t})`;
    ctx.lineWidth = 2 + t * 10;
    ctx.shadowColor = '#66e0ff';
    ctx.shadowBlur = 15 * t;
    ctx.beginPath();
    ctx.moveTo(rastro[i - 1].x * w, rastro[i - 1].y * h);
    ctx.lineTo(rastro[i].x * w, rastro[i].y * h);
    ctx.stroke();
  }

  // Punto actual
  if (punto) {
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(punto.x * w, punto.y * h, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function actualizarStats() {
  cuadrosSeg++;
  const ahora = performance.now();
  if (ahora - ultimoSeg >= 1000) {
    $('fps').textContent = Math.round(cuadrosSeg * 1000 / (ahora - ultimoSeg));
    cuadrosSeg = 0; ultimoSeg = ahora;
    $('tasa').textContent = cuadros ? Math.round(100 * detectados / cuadros) + '%' : '–';
  }
}

// ---------- Controles ----------
function ajustarLienzo() {
  const r = lienzo.getBoundingClientRect();
  lienzo.width = r.width; lienzo.height = r.height;
}
window.addEventListener('resize', ajustarLienzo);

async function cambiarModo(modo) {
  $('btn-mano').classList.toggle('activo', modo === 'mano');
  $('btn-color').classList.toggle('activo', modo === 'color');
  document.body.classList.toggle('modo-color', modo === 'color');
  await tracker.usarModo(modo);
  rastro.length = 0;
  reiniciarConteo();
}
$('btn-mano').addEventListener('click', () => cambiarModo('mano'));
$('btn-color').addEventListener('click', () => cambiarModo('color'));

$('suavizado').addEventListener('input', (e) => {
  tracker.ajustarFiltro({ frecuenciaMin: Number(e.target.value) });
  $('val-suavizado').textContent = e.target.value;
});
$('rastro').addEventListener('input', (e) => {
  largoRastro = Number(e.target.value);
  $('val-rastro').textContent = e.target.value;
});
$('tolerancia').addEventListener('input', (e) => {
  tracker.configColor.toleranciaTono = Number(e.target.value);
  $('val-tolerancia').textContent = e.target.value;
});

// Modo color: clic sobre el video para elegir el color de la bolita
const muestreo = document.createElement('canvas');
const ctxMuestreo = muestreo.getContext('2d', { willReadFrequently: true });
lienzo.addEventListener('click', (e) => {
  if (!tracker || tracker.modo !== 'color') return;
  const r = lienzo.getBoundingClientRect();
  // El video se ve en espejo, así que invertimos x para leer el píxel real
  const x = Math.floor((1 - (e.clientX - r.left) / r.width) * video.videoWidth);
  const y = Math.floor(((e.clientY - r.top) / r.height) * video.videoHeight);
  muestreo.width = video.videoWidth; muestreo.height = video.videoHeight;
  ctxMuestreo.drawImage(video, 0, 0);
  // Promedio de un cuadrito de 5x5 píxeles, para no depender de un solo píxel
  const { data } = ctxMuestreo.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5);
  let r2 = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r2 += data[i]; g += data[i + 1]; b += data[i + 2]; }
  const n = data.length / 4;
  r2 /= n; g /= n; b /= n;
  tracker.configColor.colorHSV = rgbAHsv(r2, g, b);
  $('muestra').style.background = `rgb(${r2}, ${g}, ${b})`;
  reiniciarConteo();
});
$('muestra').style.background = 'hsl(120, 100%, 50%)';

function reiniciarConteo() { cuadros = 0; detectados = 0; $('tasa').textContent = '–'; }
$('reiniciar').addEventListener('click', reiniciarConteo);
