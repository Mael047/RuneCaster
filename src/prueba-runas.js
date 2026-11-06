// =============================================================
// Página de prueba del reconocimiento de runas (hipótesis H2)
// Une el seguimiento (tracking.js) con el reconocedor (runas.js)
// y lleva un registro de aciertos por runa para la prueba con usuarios.
// =============================================================

import { encenderCamara, crearTracker } from './tracking.js';
import { reconocerRuna, SegmentadorTrazos, AJUSTES } from './runas.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const lienzo = $('trazo');
const ctx = lienzo.getContext('2d');

const RUNAS = {
  circulo:   { nombre: 'Círculo',   simbolo: '◯', color: '#66e0ff' },
  linea:     { nombre: 'Línea',     simbolo: '─', color: '#ffd23f' },
  triangulo: { nombre: 'Triángulo', simbolo: '△', color: '#ff5fd2' },
};

let tracker = null;
let modo = 'mouse';
let puntoActual = null;
let trazoMouse = null;             // puntos mientras se arrastra el mouse
let ultimoTrazo = null;            // { puntos, color, hasta } para mostrarlo un momento
let estabaEsperando = false;
let objetivo = null;               // runa que se le pidió dibujar al participante
const intentos = [];               // registro de la prueba

// ---------- Segmentador (para cámara) ----------
const segmentador = new SegmentadorTrazos({
  alEmpezar: () => { $('estado-trazo').textContent = '✨ Dibujando…'; },
  alTerminar: (puntos, motivo) => procesarTrazo(puntos, motivo),
});

// ---------- Procesar un trazo terminado ----------
function textoEspera() {
  return modo === 'mouse'
    ? 'Mantén presionado el clic y dibuja una runa'
    : 'Mueve la mano para empezar una runa';
}

const MOTIVOS_FIN = { cierre: 'cerró la figura', pausa: 'pausa', perdido: 'mano fuera de cámara', tiempo: 'tiempo máximo' };

function procesarTrazo(puntos, motivoFin) {
  $('estado-trazo').textContent = textoEspera();
  const r = reconocerRuna(puntos);
  // Movimientos diminutos (temblor, acomodar la mano) se ignoran en silencio
  if (r.motivo === 'trazo muy pequeño' || r.motivo === 'trazo muy corto') return;
  const fin = motivoFin ? ` · terminó por: ${MOTIVOS_FIN[motivoFin]}` : '';
  const info = RUNAS[r.runa];
  ultimoTrazo = { puntos, color: info ? info.color : '#ff6b6b', hasta: performance.now() + 900 };

  // Retroalimentación inmediata. El fallo es "amable": dice qué pasó, sin castigar.
  const el = $('resultado');
  el.innerHTML = info
    ? `${info.simbolo} ${info.nombre}<small>parecido: ${Math.round(r.puntaje * 100)}%${fin}</small>`
    : `🌀 Runa no reconocida<small>${r.motivo}${fin} · inténtalo otra vez</small>`;
  el.style.color = info ? info.color : '#ffb3b3';
  el.classList.add('visible');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), 1400);

  registrarIntento(r, motivoFin);
}

// ---------- Registro H2 ----------
function registrarIntento(r, motivoFin) {
  if (!objetivo) return;           // sin runa pedida no se registra
  intentos.push({
    participante: $('participante').value.trim() || '(sin nombre)',
    objetivo,
    reconocida: r.runa ?? 'ninguna',
    puntaje: r.puntaje.toFixed(3),
    acierto: r.runa === objetivo ? 1 : 0,
    fin: motivoFin || 'mouse',
    modo,
    hora: new Date().toLocaleTimeString('es-CO'),
  });
  actualizarTabla();
}

function actualizarTabla() {
  let filas = '', totalI = 0, totalA = 0;
  for (const [clave, info] of Object.entries(RUNAS)) {
    const deEsta = intentos.filter((i) => i.objetivo === clave);
    const aciertos = deEsta.filter((i) => i.acierto).length;
    totalI += deEsta.length; totalA += aciertos;
    const pct = deEsta.length ? Math.round((100 * aciertos) / deEsta.length) + '%' : '–';
    filas += `<tr><td>${info.simbolo} ${info.nombre}</td><td>${deEsta.length}</td><td>${aciertos}</td><td>${pct}</td></tr>`;
  }
  $('tabla').innerHTML = filas;
  $('total').textContent = totalI ? `${Math.round((100 * totalA) / totalI)}% (${totalA}/${totalI})` : '–';
}
actualizarTabla();

document.querySelectorAll('[data-objetivo]').forEach((btn) =>
  btn.addEventListener('click', () => {
    objetivo = objetivo === btn.dataset.objetivo ? null : btn.dataset.objetivo;
    document.querySelectorAll('[data-objetivo]').forEach((b) =>
      b.classList.toggle('activo', b.dataset.objetivo === objetivo));
  }));

// Copia en formato de tabla: se pega directo en Google Sheets o Excel
$('copiar').addEventListener('click', async () => {
  const cols = ['participante', 'objetivo', 'reconocida', 'puntaje', 'acierto', 'fin', 'modo', 'hora'];
  const texto = [cols.join('\t'), ...intentos.map((i) => cols.map((c) => i[c]).join('\t'))].join('\n');
  try {
    await navigator.clipboard.writeText(texto);
    $('aviso-copia').textContent = `Copiados ${intentos.length} intentos. Pégalos en una hoja de cálculo.`;
  } catch {
    $('aviso-copia').textContent = 'El navegador no dejó copiar. Prueba de nuevo.';
  }
});
$('borrar').addEventListener('click', () => {
  intentos.length = 0; actualizarTabla(); $('aviso-copia').textContent = '';
});

// ---------- Inicio ----------
$('con-mouse').addEventListener('click', () => { $('inicio').remove(); iniciar('mouse'); });
$('con-camara').addEventListener('click', async () => {
  $('error').textContent = '';
  try {
    $('estado').textContent = 'Pidiendo permiso para la cámara…';
    await encenderCamara(video);
    $('estado').textContent = 'Cargando el modelo de la mano…';
    tracker = await crearTracker({ video, modo: 'mano' });
    $('inicio').remove();
    iniciar('mano');
  } catch (e) {
    console.error(e);
    $('estado').textContent = '';
    $('error').textContent = e.name === 'NotAllowedError'
      ? 'No se dio permiso para usar la cámara. Puedes probar con el mouse.'
      : 'No se pudo usar la cámara: ' + e.message;
  }
});

function iniciar(modoInicial) {
  ajustarLienzo();
  cambiarModo(modoInicial);
  requestAnimationFrame(bucle);
}

async function cambiarModo(nuevo) {
  if (nuevo !== 'mouse' && !tracker) {
    $('aviso-copia').textContent = 'Para usar la cámara, recarga la página y elige "Usar la cámara".';
    return;
  }
  modo = nuevo;
  if (tracker && nuevo !== 'mouse') await tracker.usarModo(nuevo);
  segmentador.reiniciar();
  document.body.classList.toggle('modo-mouse', modo === 'mouse');
  document.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
  $('estado-trazo').textContent = textoEspera();
}
document.querySelectorAll('[data-modo]').forEach((b) =>
  b.addEventListener('click', () => cambiarModo(b.dataset.modo)));

// ---------- Mouse ----------
function puntoDesdeEvento(e) {
  const r = lienzo.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}
lienzo.addEventListener('pointerdown', (e) => {
  if (modo !== 'mouse') return;
  lienzo.setPointerCapture(e.pointerId);
  trazoMouse = [puntoDesdeEvento(e)];
});
lienzo.addEventListener('pointermove', (e) => {
  if (trazoMouse) trazoMouse.push(puntoDesdeEvento(e));
});
lienzo.addEventListener('pointerup', () => {
  if (!trazoMouse) return;
  const puntos = trazoMouse; trazoMouse = null;
  procesarTrazo(puntos);
});

// ---------- Bucle ----------
function bucle() {
  if (modo !== 'mouse' && tracker) {
    puntoActual = tracker.detectar();
    segmentador.actualizar(puntoActual);
    const esperando = segmentador.enEspera();
    if (esperando !== estabaEsperando) {
      estabaEsperando = esperando;
      if (!segmentador.dibujando) $('estado-trazo').textContent = esperando ? '⏳ Un momento…' : textoEspera();
    }
  } else {
    puntoActual = null;
  }
  dibujar();
  requestAnimationFrame(bucle);
}

function dibujarCamino(puntos, color, grosor, alfa = 1) {
  if (!puntos || puntos.length < 2) return;
  const w = lienzo.width, h = lienzo.height;
  ctx.globalAlpha = alfa;
  ctx.strokeStyle = color; ctx.lineWidth = grosor;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(puntos[0].x * w, puntos[0].y * h);
  for (const p of puntos) ctx.lineTo(p.x * w, p.y * h);
  ctx.stroke();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function dibujar() {
  const w = lienzo.width, h = lienzo.height;
  ctx.clearRect(0, 0, w, h);

  // Último trazo reconocido, que se desvanece
  if (ultimoTrazo) {
    const resta = ultimoTrazo.hasta - performance.now();
    if (resta > 0) dibujarCamino(ultimoTrazo.puntos, ultimoTrazo.color, 8, Math.min(1, resta / 500));
    else ultimoTrazo = null;
  }

  // Trazo en curso
  const enCurso = modo === 'mouse' ? trazoMouse : (segmentador.dibujando ? segmentador.puntos : null);
  dibujarCamino(enCurso, '#ffffff', 6);

  // Punto de la mano o varita
  if (puntoActual) {
    // Blanco = dibujando · morado = listo · gris = esperando para la siguiente runa
    ctx.fillStyle = segmentador.dibujando ? '#ffffff' : segmentador.enEspera() ? '#666677' : '#9a8cff';
    ctx.shadowColor = '#66e0ff'; ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(puntoActual.x * w, puntoActual.y * h, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ---------- Ajustes ----------
function ajustarLienzo() {
  const r = lienzo.getBoundingClientRect();
  lienzo.width = r.width; lienzo.height = r.height;
}
window.addEventListener('resize', ajustarLienzo);

$('exigencia').addEventListener('input', (e) => {
  AJUSTES.puntajeMinimo = Number(e.target.value);
  $('val-exigencia').textContent = e.target.value;
});
$('pausa').addEventListener('input', (e) => {
  segmentador.tiempoPausa = Number(e.target.value);
  $('val-pausa').textContent = e.target.value;
});
$('temblor').addEventListener('input', (e) => {
  tracker?.ajustarFiltro({ frecuenciaMin: Number(e.target.value) });
  $('val-temblor').textContent = e.target.value;
});
$('espera').addEventListener('input', (e) => {
  segmentador.tiempoEspera = Number(e.target.value);
  $('val-espera').textContent = e.target.value;
});
$('radio').addEventListener('input', (e) => {
  segmentador.radioQuieto = Number(e.target.value);
  $('val-radio').textContent = e.target.value;
});
$('cierre').addEventListener('change', (e) => { segmentador.cierreAutomatico = e.target.checked; });
$('inicio-vel').addEventListener('input', (e) => {
  segmentador.velocidadInicio = Number(e.target.value);
  $('val-inicio').textContent = e.target.value;
});
