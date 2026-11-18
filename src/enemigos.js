// =============================================================
// RUNCASTER – los 3 tipos de enemigo
// -------------------------------------------------------------
//   Orco     -> runa círculo  ◯  (velocidad normal)
//   Cangrejo -> runa línea    ─  (el más rápido)
//   Demonio  -> runa triángulo △  (lento, pero hace el doble de daño)
//
// Cada enemigo lleva encima un ícono con la runa que lo vence, en el
// color de esa runa, para que el jugador sepa qué dibujar.
//
// Animaciones (vienen en los FBX): Walk mientras avanza, Death cuando
// lo alcanza un hechizo y Bite_Front cuando llega a la torre.
// Si un modelo no cargó, se usa la forma básica de antes.
// =============================================================

import * as THREE from 'three';
import { clonarModelo, buscarAnimacion } from './modelos.js';

export const TIPOS = {
  circulo: {
    nombre: 'Orco', plural: 'Orcos', simbolo: '◯', color: 0x66e0ff, modelo: 'orco',
    velocidad: [1.6, 2.0], puntos: 10, danio: 10,
    crearForma: (mat) => new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), mat),
  },
  linea: {
    nombre: 'Cangrejo', plural: 'Cangrejos', simbolo: '─', color: 0xffd23f, modelo: 'cangrejo',
    velocidad: [2.4, 2.9], puntos: 15, danio: 10,
    crearForma: (mat) => new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.3), mat),
  },
  triangulo: {
    nombre: 'Demonio', plural: 'Demonios', simbolo: '△', color: 0xff5fd2, modelo: 'demonio',
    velocidad: [1.1, 1.4], puntos: 20, danio: 20,
    crearForma: (mat) => new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 3), mat),
  },
};

// ---------- Íconos de runa (se dibujan una vez en un lienzo 2D) ----------
function crearTexturaRuna(clave, color) {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 128;
  const c = lienzo.getContext('2d');
  const hex = '#' + color.toString(16).padStart(6, '0');
  // Fondo: círculo oscuro para que el ícono se lea sobre cualquier cosa
  c.fillStyle = 'rgba(10, 8, 30, 0.75)';
  c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();
  c.strokeStyle = hex; c.lineWidth = 11; c.lineCap = c.lineJoin = 'round';
  c.shadowColor = hex; c.shadowBlur = 14;
  c.beginPath();
  if (clave === 'circulo') c.arc(64, 64, 30, 0, Math.PI * 2);
  else if (clave === 'linea') { c.moveTo(30, 64); c.lineTo(98, 64); }
  else { c.moveTo(64, 30); c.lineTo(98, 92); c.lineTo(30, 92); c.closePath(); }
  c.stroke();
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

const materialesIcono = {};
const materialesForma = {};
for (const [clave, tipo] of Object.entries(TIPOS)) {
  materialesIcono[clave] = new THREE.SpriteMaterial({ map: crearTexturaRuna(clave, tipo.color), depthWrite: false });
  materialesForma[clave] = new THREE.MeshStandardMaterial({
    color: tipo.color, emissive: tipo.color, emissiveIntensity: 0.35, flatShading: true,
  });
}

// ---------- Crear un enemigo ----------
// `modelos` es lo que devuelve cargarModelos(); puede faltar alguno.
export function crearEnemigo(clave, posicion, multiplicadorVelocidad = 1, modelos = {}) {
  const tipo = TIPOS[clave];
  const enemigo = new THREE.Group();
  const modelo = modelos[tipo.modelo];
  const d = {
    tipo: clave,
    estado: 'caminando',      // 'caminando' | 'muriendo' | 'atacando'
    fase: Math.random() * Math.PI * 2,
    apuntado: false,
    mixer: null,
    acciones: {},
  };

  let altura;
  if (modelo) {
    const cuerpo = clonarModelo(modelo);
    enemigo.add(cuerpo);
    altura = modelo.altura;
    // Animaciones: cada enemigo tiene su propio "mixer" (reproductor)
    d.mixer = new THREE.AnimationMixer(cuerpo);
    for (const nombre of ['Walk', 'Death', 'Bite_Front']) {
      const clip = buscarAnimacion(modelo.animaciones, nombre);
      if (clip) d.acciones[nombre] = d.mixer.clipAction(clip);
    }
    const caminar = d.acciones.Walk;
    if (caminar) {
      caminar.play();
      caminar.time = Math.random() * caminar.getClip().duration;   // no todos al mismo paso
    }
  } else {
    const forma = tipo.crearForma(materialesForma[clave]);
    forma.castShadow = true;
    forma.position.y = 0.8;
    enemigo.add(forma);
    d.forma = forma;
    altura = 1.4;
  }
  d.alturaCentro = altura * 0.5;

  // Ícono de la runa flotando encima
  const icono = new THREE.Sprite(materialesIcono[clave]);
  icono.scale.setScalar(1.25);
  icono.position.y = altura + 0.6;
  d.alturaIcono = icono.position.y;
  icono.renderOrder = 10;
  enemigo.add(icono);
  d.icono = icono;

  enemigo.position.copy(posicion);
  const [min, max] = tipo.velocidad;
  d.velocidad = THREE.MathUtils.randFloat(min, max) * multiplicadorVelocidad;
  // La animación de caminar se acelera un poco con la velocidad
  if (d.acciones.Walk) d.acciones.Walk.timeScale = d.velocidad / ((min + max) / 2);
  enemigo.userData = d;
  return enemigo;
}

// ---------- Animar (cada cuadro) ----------
export function animarEnemigo(enemigo, delta, tiempo) {
  const d = enemigo.userData;
  if (d.mixer) d.mixer.update(delta);
  if (d.icono) d.icono.position.y = d.alturaIcono + Math.sin(tiempo * 3 + d.fase) * 0.12;   // el ícono flota
  if (d.forma && d.estado === 'caminando') d.forma.rotation.y += delta * 2;
}

// Hace que el enemigo mire hacia donde camina (los modelos miran hacia +Z)
export function mirarHacia(enemigo, direccion) {
  enemigo.rotation.y = Math.atan2(direccion.x, direccion.z);
}

// Reproduce una animación una sola vez (morir, morder).
// Devuelve cuántos segundos dura, para saber cuándo quitar al enemigo.
export function reproducirUnaVez(enemigo, nombre) {
  const d = enemigo.userData;
  const accion = d.acciones[nombre];
  if (d.icono) d.icono.visible = false;
  if (!accion) return 0;
  d.acciones.Walk?.fadeOut(0.1);
  accion.reset();
  accion.setLoop(THREE.LoopOnce, 1);
  accion.clampWhenFinished = true;     // se queda en la última pose
  accion.fadeIn(0.1).play();
  return accion.getClip().duration;
}

// Punto donde debe impactar un hechizo (el centro del cuerpo)
export function centroEnemigo(enemigo, destino = new THREE.Vector3()) {
  return destino.copy(enemigo.position).setY(enemigo.position.y + enemigo.userData.alturaCentro);
}
