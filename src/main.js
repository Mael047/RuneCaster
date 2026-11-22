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
import { TIPOS, crearEnemigo, animarEnemigo, centroEnemigo, mirarHacia, reproducirUnaVez } from './enemigos.js';
import { cargarModelos } from './modelos.js';
import { prepararAudio, activar as activarSonido, reproducir, empezarDibujo, terminarDibujo,
         musicaBaja, alternarSilencio, sonarBoton, fijarVolumen, leerVolumen } from './sonido.js';
import { encenderCamara, crearTracker, leerColor, fijarColor, ANCHO_COLOR, ALTO_COLOR } from './tracking.js';
import { reconocerRuna, SegmentadorTrazos, AJUSTES } from './runas.js';

const $ = (id) => document.getElementById(id);

// ---------- Sonido ----------
// Se prepara apenas abre la página, para que la ambientación suene ya en
// la portada. Si el navegador aún no deja sonar, se muestra un aviso.
prepararAudio((bloqueado) => { $('aviso-sonido').hidden = !bloqueado; });
// Todos los botones hacen su sonido al pulsarlos
document.addEventListener('click', (e) => {
  const boton = e.target.closest('button');
  if (boton && !boton.disabled) sonarBoton();
});

// ---------- Configuración (volúmenes) ----------
// Se abre desde la portada. Los cambios se escuchan en vivo y se guardan.
function prepararDeslizadorVolumen(tipo, idDeslizador, idValor) {
  const el = $(idDeslizador);
  el.value = Math.round(leerVolumen(tipo) * 100);
  $(idValor).textContent = el.value;
  pintarDeslizador(el);
  el.addEventListener('input', () => {
    fijarVolumen(tipo, el.value / 100);
    $(idValor).textContent = el.value;
    pintarDeslizador(el);
  });
}
prepararDeslizadorVolumen('ambiente', 'vol-ambiente', 'val-ambiente');
prepararDeslizadorVolumen('efectos', 'vol-efectos', 'val-efectos');
// Al soltar el de efectos, suena un acierto para escuchar cómo queda
$('vol-efectos').addEventListener('change', () => reproducir('acierto'));
// Estrellas de la configuración: mismo dibujo que en la portada, repartidas
// parejo (7 a cada lado, 3 arriba y 6 abajo) y lejos de los controles.
// Posición (esquina superior izquierda) en el lienzo de Figma (1728x1117) y tamaño.
const ESTRELLAS_CONFIG = [
  // izquierda
  [60, 80, 87], [210, 230, 34], [90, 400, 105], [240, 560, 34], [50, 700, 71], [180, 860, 99], [70, 1010, 34],
  // derecha
  [1580, 90, 105], [1470, 250, 34], [1610, 420, 71], [1480, 580, 34], [1620, 730, 87], [1500, 880, 34], [1590, 990, 99],
  // arriba
  [520, 30, 34], [880, 30, 71], [1250, 25, 34],
  // abajo
  [380, 960, 71], [560, 880, 34], [640, 1040, 34], [1150, 890, 34], [1000, 1000, 87], [1290, 970, 34],
];
const plantillaEstrella = document.querySelector('#portada .estrella');
for (const [x, y, t] of ESTRELLAS_CONFIG) {
  const e = plantillaEstrella.cloneNode();
  e.style.left = ((x + t / 2) / 1728 * 100) + '%';
  e.style.top = ((y + t / 2) / 1117 * 100) + '%';
  e.style.setProperty('--t', t);
  $('config').prepend(e);
}

// Se abre desde la portada o desde la pausa, y "volver" regresa a donde estaba
let origenConfig = 'portada';
function abrirConfig(origen) {
  origenConfig = origen;
  $(origen).hidden = true;
  $('config').hidden = false;
}
function cerrarConfig() {
  $('config').hidden = true;
  $(origenConfig).hidden = false;
}
$('abrir-config').addEventListener('click', () => abrirConfig('portada'));
$('cerrar-config').addEventListener('click', cerrarConfig);

// ---------- Modelos 3D ----------
// Se cargan antes de todo; mientras tanto, los botones de inicio esperan.
// La portada muestra el progreso y el botón "comenzar" se activa al terminar.
$('estado-carga').textContent = 'Cargando…';
const modelos = await cargarModelos((n, total) => {
  $('estado-carga').textContent = `Cargando… ${n}/${total}`;
});
$('estado-carga').textContent = '';
$('comenzar').disabled = false;
// Portada -> elegir modo de juego
$('comenzar').addEventListener('click', () => {
  activarSonido();                      // el navegador solo deja sonar tras un clic
  abrirModos('portada');
});

// ---------- Mundo ----------
const { scene, camera, renderer, cristal, radioTorre, sacudir, actualizarCamara } = crearEscena(document.body, modelos);
const efectos = new Efectos(scene);
const enemigos = [];      // enemigos que avanzan (se les puede apuntar)
const saliendo = [];      // enemigos muriendo o mordiendo la torre: { enemigo, quedan }
const hechizos = [];
// Distancia a la torre en la que un enemigo la alcanza
const DISTANCIA_ATAQUE = radioTorre + 0.7;

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
  const enemigo = crearEnemigo(tipo, pos, juego.multiplicadorVelocidad, modelos);
  scene.add(enemigo);
  enemigos.push(enemigo);
  reproducir(TIPOS[tipo].modelo, { variacion: 0.06 });   // 'orco', 'cangrejo' o 'demonio'
}

function eliminarEnemigo(enemigo) {
  scene.remove(enemigo);
  const i = enemigos.indexOf(enemigo);
  if (i >= 0) enemigos.splice(i, 1);
}

// Saca al enemigo de la partida, pero lo deja en escena mientras
// termina una animación (morir o morder) y luego lo quita.
function despedirEnemigo(enemigo, animacion) {
  const i = enemigos.indexOf(enemigo);
  if (i >= 0) enemigos.splice(i, 1);
  const duracion = reproducirUnaVez(enemigo, animacion);
  if (!duracion) { scene.remove(enemigo); return; }   // forma básica: sin animación
  saliendo.push({ enemigo, quedan: duracion + 0.5 });
}

function actualizarSalientes(delta, tiempo) {
  for (let i = saliendo.length - 1; i >= 0; i--) {
    const s = saliendo[i];
    s.quedan -= delta;
    animarEnemigo(s.enemigo, delta, tiempo);
    if (s.quedan < 0.3) s.enemigo.position.y -= delta * 3;   // se hunde al final
    if (s.quedan <= 0) {
      scene.remove(s.enemigo);
      saliendo.splice(i, 1);
    }
  }
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
  if (pausado || (juego.estado !== 'jugando' && juego.estado !== 'descanso')) return;
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
      reproducir('acierto', { variacion: 0.04 });
      despedirEnemigo(e, 'Death');
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
    if (dir.length() < DISTANCIA_ATAQUE) {   // llegó a la torre: muerde y desaparece
      const tipo = TIPOS[e.userData.tipo];
      efectos.explosion(centroEnemigo(e, new THREE.Vector3()), 0xff5f7a, 20, 5);
      despedirEnemigo(e, 'Bite_Front');
      recibirDanio(tipo.danio);
      continue;
    }
    mirarHacia(e, dir);
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

// Quita enemigos, hechizos y efectos, y deja vida y puntaje como al inicio
function limpiarPartida() {
  for (const e of [...enemigos]) eliminarEnemigo(e);
  for (const s of saliendo) scene.remove(s.enemigo);
  saliendo.length = 0;
  for (let i = hechizos.length - 1; i >= 0; i--) quitarHechizo(i);
  efectos.limpiar();
  juego.vida = 100;
  juego.puntaje = 0;
  juego.porAparecer = [];
  $('vida-relleno').style.width = '100%';
  $('puntaje').textContent = 0;
  segmentador.reiniciar();
}

function reiniciarPartida() {
  limpiarPartida();
  $('fin').hidden = true;
  iniciarOleada(1);
}

// ---------- Mensajes en pantalla ----------
let temporizadorMensaje;
function mostrarMensaje(titulo, detalle = '', duracion = 1500) {
  const el = $('mensaje');
  // Los números van en <span class="num"> para alinearlos con las letras
  const conNumeros = (t) => String(t).replace(/\d+/g, '<span class="num">$&</span>');
  el.innerHTML = `${conNumeros(titulo)}${detalle ? `<small>${conNumeros(detalle)}</small>` : ''}`;
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
  alEmpezar: () => { if (enPartida()) empezarDibujo(); },
  alTerminar: (puntos) => { terminarDibujo(); procesarTrazo(puntos); },
});

function procesarTrazo(puntos) {
  if (!enPartida()) return;            // fuera de la partida no se reconocen runas
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
  if (modo !== 'mouse' || !enPartida()) return;
  lienzo.setPointerCapture(e.pointerId);
  trazoMouse = [puntoMouse(e)];
  empezarDibujo();
});
lienzo.addEventListener('pointermove', (e) => { if (trazoMouse) trazoMouse.push(puntoMouse(e)); });
lienzo.addEventListener('pointerup', () => {
  if (!trazoMouse) return;
  terminarDibujo();
  const puntos = trazoMouse;
  trazoMouse = null;
  procesarTrazo(puntos);
});

// --- Botones de inicio ---
// Modos: 'camara' (mano con MediaPipe), 'color' (varita de color) y 'mouse'.
// MediaPipe usa la tarjeta gráfica (GPU), que es lo más rápido.
// Si en algún computador va mal, abrir el juego como index.html?cpu
const DELEGADO = new URLSearchParams(location.search).has('cpu') ? 'CPU' : 'GPU';
let stream = null;

// Enciende la cámara y crea el tracker una sola vez; luego solo cambia de modo
async function prepararCamara(modoTracker, elEstado = $('modos-estado')) {
  if (!stream) {
    elEstado.textContent = 'Pidiendo permiso para la cámara…';
    stream = await encenderCamara($('video'));
  }
  if (modoTracker === 'mano') {
    elEstado.textContent = 'Cargando el modelo de la mano (unos segundos la primera vez)…';
  }
  if (!tracker) tracker = await crearTracker({ video: $('video'), modo: modoTracker, delegado: DELEGADO });
  else await tracker.usarModo(modoTracker);
  elEstado.textContent = '';
}

function mensajeErrorCamara(e) {
  return e.name === 'NotAllowedError'
    ? 'No se dio permiso para la cámara. Puedes jugar con el mouse.'
    : 'No se pudo usar la cámara: ' + e.message;
}

// =============================================================
// ELEGIR MODO DE JUEGO
//   Desde la portada: elegir modo -> (varita: calibración) -> instrucciones -> juego
//   Desde la pausa:   elegir modo -> (varita: calibración) -> vuelve a la pausa
//                     con el modo nuevo, sin perder la partida
// =============================================================
let origenModos = 'portada';   // 'portada' o 'pausa'
let modoPendiente = null;      // modo elegido, antes de empezar la partida

function abrirModos(origen) {
  origenModos = origen;
  $('modos-estado').textContent = '';
  $('modos-estado').classList.remove('error');
  // Desde la pausa se marca el modo con el que se está jugando
  document.querySelectorAll('.tarjeta-modo').forEach((t) => {
    const actual = origen === 'pausa' && t.dataset.modo === modo;
    t.classList.toggle('activo', actual);
    t.querySelector('.actual').textContent = actual ? 'modo actual' : '';
  });
  for (const id of ['portada', 'pausa', 'inicio', 'calibrar']) $(id).hidden = true;
  $('modos').hidden = false;
}

function volverDeModos() {
  $('modos').hidden = true;
  $(origenModos).hidden = false;
}

function bloquearModos(bloquear) {
  document.querySelectorAll('#modos button').forEach((b) => (b.disabled = bloquear));
}

async function elegirModo(nuevo) {
  $('modos-estado').classList.remove('error');
  $('modos-estado').textContent = '';
  bloquearModos(true);
  try {
    if (nuevo === 'camara') await prepararCamara('mano');
    if (nuevo === 'color') await prepararCamara('color');
  } catch (e) {
    console.error(e);
    $('modos-estado').classList.add('error');
    $('modos-estado').textContent = mensajeErrorCamara(e);
    if (tracker && modo === 'camara') tracker.usarModo('mano').catch(() => {});
    bloquearModos(false);
    return;
  }
  bloquearModos(false);
  $('modos').hidden = true;
  if (nuevo === 'color') abrirCalibracion();   // la varita pasa primero por la calibración
  else terminarEleccion(nuevo);
}

// Después de elegir el modo (y de calibrar, si es la varita)
function terminarEleccion(nuevo) {
  if (origenModos === 'pausa') {
    aplicarModo(nuevo);                 // la misma partida sigue con el modo nuevo
    $('pausa').hidden = false;
  } else {
    modoPendiente = nuevo;
    $('inicio').hidden = false;         // instrucciones: qué runa vence a cada enemigo
  }
}

document.querySelectorAll('.tarjeta-modo').forEach((t) =>
  t.addEventListener('click', () => elegirModo(t.dataset.modo)));
$('modos-volver').addEventListener('click', volverDeModos);

// Instrucciones
$('instr-jugar').addEventListener('click', () => empezar(modoPendiente || 'mouse'));
$('instr-volver').addEventListener('click', () => abrirModos('portada'));

$('otra-vez').addEventListener('click', reiniciarPartida);
$('fin-menu').addEventListener('click', volverAlMenu);

// Cambia el modo de entrada sin tocar la partida
function aplicarModo(nuevoModo) {
  modo = nuevoModo;
  // El reconocedor corrige el estiramiento según la forma del área de dibujo
  AJUSTES.aspecto = modo === 'mouse' ? innerWidth / innerHeight : 4 / 3;
  document.body.classList.remove('modo-camara', 'modo-color', 'modo-mouse');
  document.body.classList.add('modo-' + modo);
  segmentador.reiniciar();
  trazoMouse = null;
  puntoActual = null;
}

function empezar(nuevoModo) {
  aplicarModo(nuevoModo);
  document.body.classList.add('en-partida');   // muestra el HUD
  $('inicio').hidden = true;
  $('modos').hidden = true;
  $('calibrar').hidden = true;
  reiniciarPartida();
}

// =============================================================
// PAUSA (tecla Esc)
// Desde la pausa se puede continuar, cambiar el modo de juego sin perder
// la partida (abre "Elige cómo jugar"), abrir la configuración o volver al menú.
// =============================================================
let pausado = false;

function pausar() {
  if (pausado || (juego.estado !== 'jugando' && juego.estado !== 'descanso')) return;
  pausado = true;
  segmentador.reiniciar();
  trazoMouse = null;
  puntoActual = null;
  $('pausa-oleada').textContent = juego.oleada;
  $('pausa-puntaje').textContent = juego.puntaje;
  $('pausa-estado').textContent = '';
  $('mensaje').classList.remove('visible');
  terminarDibujo();
  musicaBaja(true);
  $('pausa').hidden = false;
}

function continuar() {
  if (!pausado) return;
  calibrando = false;
  $('calibrar').hidden = true;
  $('pausa').hidden = true;
  pausado = false;
  segmentador.reiniciar();
  musicaBaja(false);
  reloj.getDelta();                     // que el tiempo en pausa no cuente
  mostrarMensaje('▶', '', 600);
}

$('continuar').addEventListener('click', continuar);
$('boton-esc').addEventListener('click', pausar);
$('pausa-menu').addEventListener('click', volverAlMenu);
$('pausa-config').addEventListener('click', () => abrirConfig('pausa'));
$('pausa-modo').addEventListener('click', () => abrirModos('pausa'));
function volverAlMenu() {
  pausado = false;
  calibrando = false;
  limpiarPartida();
  juego.estado = 'inicio';
  for (const id of ['pausa', 'fin', 'calibrar', 'config', 'inicio', 'modos']) $(id).hidden = true;
  $('mensaje').classList.remove('visible');
  segmentador.reiniciar();
  trazoMouse = null;
  ultimoTrazo = null;
  puntoActual = null;
  terminarDibujo();
  musicaBaja(false);
  document.body.classList.remove('en-partida');
  $('portada').hidden = false;           // "volver al menú" lleva a la portada
}

// Tecla M: silenciar / activar el sonido
addEventListener('keydown', (e) => {
  if (e.key !== 'm' && e.key !== 'M') return;
  const silencio = alternarSilencio();
  mostrarMensaje(silencio ? 'Sonido apagado' : 'Sonido activado', 'tecla M', 1000);
});

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('config').hidden) cerrarConfig();
  else if (!$('calibrar').hidden) salirDeCalibracion();
  else if (!$('modos').hidden) volverDeModos();
  else if (!$('inicio').hidden) abrirModos('portada');
  else if (pausado) continuar();
  else pausar();
});
// Si se cambia de pestaña o se minimiza la ventana, el juego se pausa solo
document.addEventListener('visibilitychange', () => { if (document.hidden) pausar(); });

// =============================================================
// CALIBRACIÓN DEL COLOR (cuentagotas)
// El jugador hace clic sobre la punta de la varita en el video. Se lee
// ese color y la cámara empieza a buscarlo. El color queda guardado en
// el navegador para la próxima vez.
// =============================================================
const CLAVE_COLOR = 'runcaster-color';
let calibrando = false;
let colorElegido = false;
const historialDeteccion = [];   // últimos cuadros: 1 = detectó, 0 = no

// Se abre al elegir la varita en "Elige cómo jugar"
function abrirCalibracion() {
  const videoCal = $('video-calibrar');
  videoCal.srcObject = stream;
  videoCal.play();
  // Desde la portada sigue a las instrucciones; desde la pausa, vuelve a la pausa
  $('color-listo').textContent = origenModos === 'pausa' ? 'Listo' : 'continuar';
  for (const id of ['portada', 'inicio', 'pausa', 'modos']) $(id).hidden = true;
  $('calibrar').hidden = false;
  if (!colorElegido) cargarColorGuardado();
  calibrando = true;
  requestAnimationFrame(bucleCalibracion);
}

// ¿Hay un color guardado de una partida anterior? Devuelve true si lo aplicó.
function cargarColorGuardado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_COLOR));
    if (!guardado) return false;
    aplicarColor(guardado.rgb, guardado.hsv);
    $('tolerancia-color').value = guardado.tolerancia;
    $('tolerancia-color').dispatchEvent(new Event('input'));
    return true;
  } catch {
    return false;   // sin almacenamiento: se elige de nuevo
  }
}

function aplicarColor(rgb, hsv) {
  fijarColor(tracker.configColor, hsv);
  $('muestra-color').style.background = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  $('color-listo').disabled = false;
  colorElegido = true;
  historialDeteccion.length = 0;
}

// Salir de la calibración sin elegir la varita: vuelve a "Elige cómo jugar"
function salirDeCalibracion() {
  calibrando = false;
  $('calibrar').hidden = true;
  // Si se estaba jugando con la mano, el tracker vuelve a seguir la mano
  if (origenModos === 'pausa' && modo === 'camara' && tracker) tracker.usarModo('mano');
  abrirModos(origenModos);
}

function guardarColor() {
  try {
    localStorage.setItem(CLAVE_COLOR, JSON.stringify({
      rgb: leerMuestra(), hsv: tracker.configColor.colorHSV,
      tolerancia: tracker.configColor.toleranciaTono,
    }));
  } catch { /* no pasa nada si no se puede guardar */ }
}
function leerMuestra() {
  const m = $('muestra-color').style.background.match(/\d+/g) || [0, 0, 0];
  return { r: +m[0], g: +m[1], b: +m[2] };
}

// Cuentagotas: clic sobre el video
$('vista-calibrar').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const color = leerColor($('video-calibrar'), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  if (color.hsv.s < 0.2) {
    $('tasa-color').textContent = 'ese color es muy gris, elige otro';
    return;
  }
  aplicarColor(color, color.hsv);
});

// El relleno del deslizador (color arena) sigue al valor
function pintarDeslizador(el) {
  const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty('--pct', pct + '%');
}
pintarDeslizador($('tolerancia-color'));
$('tolerancia-color').addEventListener('input', (e) => {
  tracker.configColor.toleranciaTono = Number(e.target.value);
  $('val-tolerancia-color').textContent = e.target.value;
  pintarDeslizador(e.target);
  historialDeteccion.length = 0;
});

$('color-listo').addEventListener('click', () => {
  calibrando = false;
  guardarColor();
  $('calibrar').hidden = true;
  terminarEleccion('color');
});
$('color-volver').addEventListener('click', salirDeCalibracion);

const lienzoCal = $('lienzo-calibrar');
const ctxCal = lienzoCal.getContext('2d');
const lienzoMascara = document.createElement('canvas');
lienzoMascara.width = ANCHO_COLOR; lienzoMascara.height = ALTO_COLOR;
const ctxMascara = lienzoMascara.getContext('2d');
const imagenMascara = ctxMascara.createImageData(ANCHO_COLOR, ALTO_COLOR);

function bucleCalibracion() {
  if (!calibrando) return;
  requestAnimationFrame(bucleCalibracion);
  const r = lienzoCal.getBoundingClientRect();
  if (lienzoCal.width !== Math.round(r.width)) { lienzoCal.width = r.width; lienzoCal.height = r.height; }
  const w = lienzoCal.width, h = lienzoCal.height;
  ctxCal.clearRect(0, 0, w, h);
  if ($('color-listo').disabled) return;          // todavía no hay color elegido

  const punto = tracker.detectar();

  // Resaltar en rosado los píxeles que coinciden con el color
  if ($('ver-mascara').checked && tracker.configColor.mascara) {
    const m = tracker.configColor.mascara, px = imagenMascara.data;
    for (let i = 0; i < m.length; i++) {
      px[i * 4] = 255; px[i * 4 + 1] = 40; px[i * 4 + 2] = 200; px[i * 4 + 3] = m[i] ? 170 : 0;
    }
    ctxMascara.putImageData(imagenMascara, 0, 0);
    ctxCal.save();
    ctxCal.imageSmoothingEnabled = false;
    ctxCal.translate(w, 0); ctxCal.scale(-1, 1);   // en espejo, como el video
    ctxCal.drawImage(lienzoMascara, 0, 0, w, h);
    ctxCal.restore();
  }

  // Punto detectado
  if (punto) {
    ctxCal.fillStyle = '#fff';
    ctxCal.shadowColor = '#66e0ff'; ctxCal.shadowBlur = 18;
    ctxCal.beginPath(); ctxCal.arc(punto.x * w, punto.y * h, 10, 0, Math.PI * 2); ctxCal.fill();
    ctxCal.shadowBlur = 0;
  }

  // Porcentaje de detección en los últimos ~2 segundos
  historialDeteccion.push(punto ? 1 : 0);
  if (historialDeteccion.length > 120) historialDeteccion.shift();
  const pct = Math.round(100 * historialDeteccion.reduce((a, b) => a + b, 0) / historialDeteccion.length);
  $('tasa-color').textContent = punto ? `la veo (${pct}%)` : `no la veo (${pct}%)`;
  // Aviso si hay otras cosas del mismo color en la imagen (reemplaza la ayuda)
  const otrasCosas = tracker.configColor.pixelesFuera > 40;
  $('aviso-color').hidden = !otrasCosas;
  $('ayuda-color').hidden = otrasCosas;
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

// Las runas solo se leen durante la partida (no en menús, pausa ni fin)
function enPartida() {
  return !pausado && (juego.estado === 'jugando' || juego.estado === 'descanso');
}

function entrada() {
  if (!enPartida()) {
    puntoActual = null;
    if (segmentador.dibujando) { segmentador.reiniciar(); terminarDibujo(); }
    return;
  }
  if ((modo === 'camara' || modo === 'color') && tracker) {
    puntoActual = tracker.detectar();
    segmentador.actualizar(puntoActual);
  }
}

function logica(delta, tiempo) {
  if (pausado) return;                 // en pausa todo se queda quieto
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
  actualizarSalientes(delta, tiempo);
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
      this.panel.style.cssText = 'position:fixed;left:16px;top:200px;margin:0;background:#000c;color:#9f9;' +
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
