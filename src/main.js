// =============================================================
// RUNCASTER – juego principal
// -------------------------------------------------------------
// Une las piezas:
//   escena.js    -> mundo 3D, torre y efectos
//   enemigos.js  -> los 3 tipos de enemigo
//   tracking.js  -> cámara y punto de la mano/varita
//   runas.js     -> reconocer la runa dibujada
//
// Reglas:
//   - Los enemigos avanzan hacia la torre por oleadas.
//   - Cada runa lanza un hechizo al enemigo MÁS CERCANO de su tipo
//     (lock-on automático): ◯ -> Orbe, ─ -> Lanza, △ -> Pico.
//   - Las primeras oleadas presentan un enemigo nuevo cada vez (tutorial).
//   - Si la vida de la torre llega a 0, termina la partida.
// =============================================================

import * as THREE from 'three';
import { crearEscena, Efectos, POSICION_TORRE } from './escena.js';
import { TIPOS, crearEnemigo, animarEnemigo, centroEnemigo } from './enemigos.js';
import { encenderCamara, crearTracker } from './tracking.js';
import { reconocerRuna, SegmentadorTrazos, AJUSTES } from './runas.js';

const $ = (id) => document.getElementById(id);

// ---------- Mundo ----------
const { scene, camera, renderer, cristal, sacudir, actualizarCamara } = crearEscena();
const efectos = new Efectos(scene);
const enemigos = [];
const hechizos = [];

// ---------- Estado de la partida ----------
const juego = {
  estado: 'inicio',          // 'inicio' | 'jugando' | 'descanso' | 'fin'
  vida: 100,
  puntaje: 0,
  oleada: 0,
  porAparecer: [],           // tipos de enemigo que faltan por salir en esta oleada
  intervalo: 2.5,            // segundos entre enemigos
  multiplicadorVelocidad: 1,
  relojAparicion: 0,
  relojDescanso: 0,
};

// ---------- Oleadas ----------
// Orden en que se presenta cada tipo de enemigo
const ORDEN_TIPOS = ['circulo', 'linea', 'triangulo'];

function tiposDisponibles(oleada) {
  return ORDEN_TIPOS.slice(0, Math.min(oleada, ORDEN_TIPOS.length));
}

function iniciarOleada(n) {
  juego.oleada = n;
  juego.estado = 'jugando';
  const tipos = tiposDisponibles(n);
  const cantidad = 3 + n * 2;
  juego.intervalo = Math.max(0.7, 2.8 - n * 0.25);
  juego.multiplicadorVelocidad = 1 + (n - 1) * 0.07;
  juego.relojAparicion = juego.intervalo;   // el primero sale de una vez

  // En las oleadas que presentan un tipo nuevo, ese tipo sale primero
  // y aparece varias veces, para que el jugador lo aprenda.
  const nuevo = n <= ORDEN_TIPOS.length ? ORDEN_TIPOS[n - 1] : null;
  juego.porAparecer = [];
  for (let i = 0; i < cantidad; i++) {
    const tipo = nuevo && (i < 2 || Math.random() < 0.4)
      ? nuevo
      : tipos[Math.floor(Math.random() * tipos.length)];
    juego.porAparecer.push(tipo);
  }

  $('oleada').textContent = n;
  document.querySelectorAll('.ficha').forEach((f) =>
    f.classList.toggle('oculta', !tipos.includes(f.dataset.tipo)));

  if (nuevo) {
    const t = TIPOS[nuevo];
    mostrarMensaje(`Oleada ${n}`, `Nuevo enemigo: ${t.nombre} · dibuja ${t.simbolo} para vencerlo`, 3200);
  } else {
    mostrarMensaje(`Oleada ${n}`, 'Los enemigos son más rápidos', 2200);
  }
}

function aparecerEnemigo() {
  const tipo = juego.porAparecer.shift();
  const pos = new THREE.Vector3(THREE.MathUtils.randFloatSpread(12), 0, -28);
  const enemigo = crearEnemigo(tipo, pos, juego.multiplicadorVelocidad);
  scene.add(enemigo);
  enemigos.push(enemigo);
}

function eliminarEnemigo(enemigo) {
  scene.remove(enemigo);
  const i = enemigos.indexOf(enemigo);
  if (i >= 0) enemigos.splice(i, 1);
}

// ---------- Hechizos ----------
const geoHechizo = new THREE.SphereGeometry(0.3, 14, 10);

// Lock-on: el enemigo más cercano a la torre del tipo pedido.
// Si hay varios, preferimos uno que todavía no tenga un hechizo en camino.
function buscarObjetivo(tipo) {
  const candidatos = enemigos.filter((e) => e.userData.tipo === tipo);
  if (!candidatos.length) return null;
  const libres = candidatos.filter((e) => !e.userData.apuntado);
  const lista = libres.length ? libres : candidatos;
  return lista.reduce((a, b) =>
    a.position.distanceTo(POSICION_TORRE) < b.position.distanceTo(POSICION_TORRE) ? a : b);
}

function lanzarHechizo(tipo) {
  if (juego.estado !== 'jugando' && juego.estado !== 'descanso') return;
  const info = TIPOS[tipo];
  const origen = cristal.getWorldPosition(new THREE.Vector3());
  const objetivo = buscarObjetivo(tipo);

  if (!objetivo) {
    // Runa bien hecha, pero no hay enemigos de ese tipo: chispas y aviso
    efectos.explosion(origen, info.color, 8, 2);
    mostrarMensaje(`${info.simbolo} ${info.nombre}`, `No hay ${info.plural} en el camino`, 1300);
    return;
  }
  objetivo.userData.apuntado = true;
  const bola = new THREE.Mesh(geoHechizo, new THREE.MeshBasicMaterial({ color: info.color }));
  bola.position.copy(origen);
  scene.add(bola);
  hechizos.push({ bola, objetivo, tipo });
  efectos.explosion(origen, info.color, 6, 2);   // destello al lanzar
}

function actualizarHechizos(delta) {
  const destino = new THREE.Vector3();
  for (let i = hechizos.length - 1; i >= 0; i--) {
    const h = hechizos[i];
    // Si su objetivo ya murió, busca otro del mismo tipo o se desvanece
    if (!enemigos.includes(h.objetivo)) {
      h.objetivo = buscarObjetivo(h.tipo);
      if (!h.objetivo) { quitarHechizo(i); continue; }
    }
    centroEnemigo(h.objetivo, destino);
    const dir = destino.sub(h.bola.position);
    const dist = dir.length();
    if (dist < 0.6) {                       // ¡impacto!
      const e = h.objetivo;
      efectos.explosion(centroEnemigo(e, new THREE.Vector3()), TIPOS[e.userData.tipo].color, 22, 6);
      sumarPuntos(TIPOS[e.userData.tipo].puntos);
      eliminarEnemigo(e);
      quitarHechizo(i);
      continue;
    }
    h.bola.position.addScaledVector(dir.normalize(), Math.min(dist, 22 * delta));
    h.bola.scale.setScalar(1 + Math.sin(performance.now() / 60) * 0.2);
  }
}

function quitarHechizo(i) {
  scene.remove(hechizos[i].bola);
  hechizos[i].bola.material.dispose();
  hechizos.splice(i, 1);
}

// ---------- Enemigos avanzando ----------
function actualizarEnemigos(delta, tiempo) {
  const dir = new THREE.Vector3();
  for (let i = enemigos.length - 1; i >= 0; i--) {
    const e = enemigos[i];
    dir.subVectors(POSICION_TORRE, e.position).setY(0);
    if (dir.length() < 1.8) {                // llegó a la torre
      const tipo = TIPOS[e.userData.tipo];
      efectos.explosion(centroEnemigo(e, new THREE.Vector3()), 0xff5f7a, 20, 5);
      eliminarEnemigo(e);
      recibirDanio(tipo.danio);
      continue;
    }
    e.position.addScaledVector(dir.normalize(), e.userData.velocidad * delta);
    animarEnemigo(e, delta, tiempo);
  }
}

// ---------- Vida y puntaje ----------
function recibirDanio(cantidad) {
  juego.vida = Math.max(0, juego.vida - cantidad);
  $('vida-relleno').style.width = juego.vida + '%';
  sacudir(0.35);
  $('hud').classList.add('golpe');
  setTimeout(() => $('hud').classList.remove('golpe'), 250);
  if (juego.vida === 0) terminarPartida();
}

function sumarPuntos(n) {
  juego.puntaje += n;
  $('puntaje').textContent = juego.puntaje;
}

function terminarPartida() {
  juego.estado = 'fin';
  $('fin-oleada').textContent = juego.oleada;
  $('fin-puntaje').textContent = juego.puntaje;
  $('fin').hidden = false;
}

function reiniciarPartida() {
  for (const e of [...enemigos]) eliminarEnemigo(e);
  for (let i = hechizos.length - 1; i >= 0; i--) quitarHechizo(i);
  efectos.limpiar();
  juego.vida = 100;
  juego.puntaje = 0;
  $('vida-relleno').style.width = '100%';
  $('puntaje').textContent = 0;
  $('fin').hidden = true;
  segmentador.reiniciar();
  iniciarOleada(1);
}

// ---------- Mensajes en pantalla ----------
let temporizadorMensaje;
function mostrarMensaje(titulo, detalle = '', duracion = 1500) {
  const el = $('mensaje');
  el.innerHTML = `${titulo}${detalle ? `<small>${detalle}</small>` : ''}`;
  el.classList.add('visible');
  clearTimeout(temporizadorMensaje);
  temporizadorMensaje = setTimeout(() => el.classList.remove('visible'), duracion);
}

// =============================================================
// ENTRADA: cámara (mano o varita), mouse y teclado
// =============================================================
let modo = null;               // 'camara' | 'mouse'
let tracker = null;
let puntoActual = null;
let trazoMouse = null;
let ultimoTrazo = null;        // { puntos, color, hasta } para el rastro que se desvanece
const lienzo = $('rastro');
const ctx = lienzo.getContext('2d');

const segmentador = new SegmentadorTrazos({
  alTerminar: (puntos) => procesarTrazo(puntos),
});

function procesarTrazo(puntos) {
  const r = reconocerRuna(puntos);
  // Movimientos diminutos se ignoran en silencio (acomodar la mano, temblor)
  if (r.motivo === 'trazo muy pequeño' || r.motivo === 'trazo muy corto') return;
  if (r.runa) {
    ultimoTrazo = { puntos, color: '#' + TIPOS[r.runa].color.toString(16).padStart(6, '0'), hasta: performance.now() + 700 };
    lanzarHechizo(r.runa);
  } else {
    // El "fallo amable": avisa, no castiga
    ultimoTrazo = { puntos, color: '#ff8a8a', hasta: performance.now() + 700 };
    mostrarMensaje('🌀 Runa no reconocida', 'inténtalo otra vez', 1200);
  }
}

// --- Teclado (para probar sin cámara) ---
const TECLAS = { 1: 'circulo', 2: 'linea', 3: 'triangulo' };
addEventListener('keydown', (e) => { if (TECLAS[e.key]) lanzarHechizo(TECLAS[e.key]); });

// --- Mouse ---
const puntoMouse = (e) => ({ x: e.clientX / innerWidth, y: e.clientY / innerHeight });
lienzo.addEventListener('pointerdown', (e) => {
  if (modo !== 'mouse') return;
  lienzo.setPointerCapture(e.pointerId);
  trazoMouse = [puntoMouse(e)];
});
lienzo.addEventListener('pointermove', (e) => { if (trazoMouse) trazoMouse.push(puntoMouse(e)); });
lienzo.addEventListener('pointerup', () => {
  if (!trazoMouse) return;
  const puntos = trazoMouse;
  trazoMouse = null;
  procesarTrazo(puntos);
});

// --- Botones de inicio ---
$('jugar-mouse').addEventListener('click', () => empezar('mouse'));
$('jugar-camara').addEventListener('click', async () => {
  $('error').textContent = '';
  try {
    $('estado').textContent = 'Pidiendo permiso para la cámara…';
    await encenderCamara($('video'));
    $('estado').textContent = 'Cargando el modelo de la mano (unos segundos la primera vez)…';
    // MediaPipe usa la tarjeta gráfica (GPU), que es lo más rápido.
    // Si en algún computador va mal, abrir el juego como index.html?cpu
    const delegado = new URLSearchParams(location.search).has('cpu') ? 'CPU' : 'GPU';
    tracker = await crearTracker({ video: $('video'), modo: 'mano', delegado });
    empezar('camara');
  } catch (e) {
    console.error(e);
    $('estado').textContent = '';
    $('error').textContent = e.name === 'NotAllowedError'
      ? 'No se dio permiso para la cámara. Puedes jugar con el mouse.'
      : 'No se pudo usar la cámara: ' + e.message;
  }
});
$('otra-vez').addEventListener('click', reiniciarPartida);

function empezar(nuevoModo) {
  modo = nuevoModo;
  // El reconocedor corrige el estiramiento según la forma del área de dibujo
  AJUSTES.aspecto = modo === 'camara' ? 4 / 3 : innerWidth / innerHeight;
  document.body.classList.add(modo === 'camara' ? 'modo-camara' : 'modo-mouse');
  $('inicio').hidden = true;
  reiniciarPartida();
}

// --- Dibujo del rastro sobre la pantalla ---
function ajustarLienzo() { lienzo.width = innerWidth; lienzo.height = innerHeight; }
addEventListener('resize', () => {
  ajustarLienzo();
  if (modo === 'mouse') AJUSTES.aspecto = innerWidth / innerHeight;
});
ajustarLienzo();

function dibujarCamino(puntos, color, grosor, alfa = 1) {
  if (!puntos || puntos.length < 2) return;
  const w = lienzo.width, h = lienzo.height;
  ctx.globalAlpha = alfa;
  ctx.strokeStyle = color; ctx.lineWidth = grosor;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(puntos[0].x * w, puntos[0].y * h);
  for (const p of puntos) ctx.lineTo(p.x * w, p.y * h);
  ctx.stroke();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function dibujarRastro() {
  const w = lienzo.width, h = lienzo.height;
  ctx.clearRect(0, 0, w, h);
  if (ultimoTrazo) {
    const resta = ultimoTrazo.hasta - performance.now();
    if (resta > 0) dibujarCamino(ultimoTrazo.puntos, ultimoTrazo.color, 9, Math.min(1, resta / 400));
    else ultimoTrazo = null;
  }
  const enCurso = modo === 'mouse' ? trazoMouse : (segmentador.dibujando ? segmentador.puntos : null);
  dibujarCamino(enCurso, '#e8f8ff', 7);

  if (puntoActual) {
    // Blanco = dibujando · morado = listo · gris = espera entre runas
    ctx.fillStyle = segmentador.dibujando ? '#ffffff' : segmentador.enEspera() ? '#666677' : '#9a8cff';
    ctx.shadowColor = '#66e0ff'; ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(puntoActual.x * w, puntoActual.y * h, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// =============================================================
// BUCLE PRINCIPAL
// =============================================================
const reloj = new THREE.Clock();

// El bucle está dividido en partes. Si una falla (por ejemplo, la detección
// de la mano), las demás siguen funcionando y la escena se sigue dibujando.
function bucle() {
  requestAnimationFrame(bucle);
  const t0 = performance.now();
  const delta = Math.min(reloj.getDelta(), 0.1);   // evita saltos si la pestaña se pausa
  const tiempo = reloj.elapsedTime;

  intentar('entrada', entrada);
  const t1 = performance.now();
  intentar('juego', () => logica(delta, tiempo));
  intentar('dibujo', () => { renderer.render(scene, camera); dibujarRastro(); });
  const t2 = performance.now();
  diagnostico.registrar(t1 - t0, t2 - t1);
}

function intentar(parte, fn) {
  try {
    fn();
  } catch (e) {
    diagnostico.errores++;
    mostrarError(e, parte);
  }
}

// Si algo falla, se muestra en pantalla (una vez) en lugar de congelar el juego
let errorMostrado = false;
function mostrarError(e, parte = '') {
  console.error(parte, e);
  diagnostico.ultimoError = `${parte ? '[' + parte + '] ' : ''}${e?.message || e}`;
  if (errorMostrado) return;
  errorMostrado = true;
  const caja = document.createElement('div');
  caja.style.cssText = 'position:fixed;top:12px;right:12px;max-width:440px;background:#3b0d18;' +
    'color:#ffd6dc;padding:10px 14px;border-radius:8px;font:13px monospace;z-index:9;white-space:pre-wrap';
  caja.textContent = `Error en el juego${parte ? ' (parte: ' + parte + ')' : ''}. Cópialo para revisarlo:\n` + (e?.stack || e);
  document.body.append(caja);
  diagnostico.mostrar(true);
}
addEventListener('error', (e) => mostrarError(e.error || e.message, 'global'));
addEventListener('unhandledrejection', (e) => mostrarError(e.reason, 'promesa'));
renderer.domElement.addEventListener('webglcontextlost', () =>
  mostrarError('La tarjeta gráfica dejó de dibujar (WebGL context lost).', 'dibujo'));

function entrada() {
  if (modo === 'camara' && tracker) {
    puntoActual = tracker.detectar();
    if (juego.estado !== 'fin') segmentador.actualizar(puntoActual);
  }
}

function logica(delta, tiempo) {
  if (juego.estado === 'jugando') {
    juego.relojAparicion += delta;
    if (juego.porAparecer.length && juego.relojAparicion >= juego.intervalo) {
      aparecerEnemigo();
      juego.relojAparicion = 0;
    }
    if (!juego.porAparecer.length && !enemigos.length) {   // oleada superada
      juego.estado = 'descanso';
      juego.relojDescanso = 2.5;
      mostrarMensaje('¡Oleada superada!', '', 1800);
    }
  } else if (juego.estado === 'descanso') {
    juego.relojDescanso -= delta;
    if (juego.relojDescanso <= 0) iniciarOleada(juego.oleada + 1);
  }

  if (juego.estado !== 'fin') {
    actualizarEnemigos(delta, tiempo);
    actualizarHechizos(delta);
  }
  efectos.actualizar(delta);
  cristal.rotation.y += delta * 2;
  actualizarCamara(delta);
}

// ---------- Panel de diagnóstico ----------
// Se abre con la tecla D, o abriendo el juego como index.html?debug
// Muestra cuántos cuadros por segundo dibuja el juego y cuánto tarda
// cada parte, para encontrar qué lo hace lento.
const diagnostico = {
  errores: 0, ultimoError: '', cuadros: 0, msEntrada: 0, msResto: 0, maxEntrada: 0,
  desde: performance.now(), panel: null,
  registrar(entrada, resto) {
    this.cuadros++; this.msEntrada += entrada; this.msResto += resto;
    this.maxEntrada = Math.max(this.maxEntrada, entrada);
    const pasado = performance.now() - this.desde;
    if (pasado >= 1000) {
      if (this.panel && !this.panel.hidden) {
        const n = this.cuadros || 1;
        this.panel.textContent =
          `Cuadros por segundo: ${Math.round(this.cuadros * 1000 / pasado)}\n` +
          `Detección mano: ${(this.msEntrada / n).toFixed(1)} ms (máx ${this.maxEntrada.toFixed(0)} ms)\n` +
          `Juego + dibujo: ${(this.msResto / n).toFixed(1)} ms\n` +
          `Modo: ${modo || '-'} · MediaPipe: ${tracker?.delegado || '-'}\n` +
          `Punto: ${puntoActual ? puntoActual.x.toFixed(2) + ', ' + puntoActual.y.toFixed(2) : 'no se ve'}\n` +
          `Errores: ${this.errores}${this.ultimoError ? '\n' + this.ultimoError : ''}`;
      }
      this.cuadros = 0; this.msEntrada = 0; this.msResto = 0; this.maxEntrada = 0;
      this.desde = performance.now();
    }
  },
  mostrar(visible) {
    if (!this.panel) {
      this.panel = document.createElement('pre');
      this.panel.style.cssText = 'position:fixed;left:16px;top:70px;margin:0;background:#000c;color:#9f9;' +
        'padding:8px 12px;border-radius:8px;font:12px/1.5 monospace;z-index:8;pointer-events:none';
      this.panel.textContent = 'Midiendo…';
      document.body.append(this.panel);
    }
    this.panel.hidden = !visible;
  },
};
if (new URLSearchParams(location.search).has('debug')) diagnostico.mostrar(true);
addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') diagnostico.mostrar(diagnostico.panel?.hidden ?? true);
});

bucle();

// ---------- Depuración ----------
// Desde la consola del navegador (F12) se puede probar, por ejemplo:
//   runcaster.iniciarOleada(3)   -> saltar a la oleada 3
//   runcaster.juego.vida = 1000  -> torre casi inmortal
window.runcaster = { juego, iniciarOleada, lanzarHechizo };
