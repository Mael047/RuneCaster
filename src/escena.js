// =============================================================
// RUNCASTER – escena 3D: cámara, luces, suelo, torre, decorado y efectos
// Responsables: Katalina (lo visual) e Isabella (lo que usa el juego)
//
// Todo lo que se ve aquí son formas básicas de Three.js. Cuando lleguen
// los modelos de Kenney/Quaternius, se reemplazan en este archivo.
// =============================================================

import * as THREE from 'three';
import { clonarModelo } from './modelos.js';

export const POSICION_TORRE = new THREE.Vector3(0, 0, 4);

// `modelos` viene de cargarModelos(). Si falta alguno, se usan formas básicas.
export function crearEscena(contenedor = document.body, modelos = {}) {
  // ---------- Escena, cámara y renderer ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a1a);
  scene.fog = new THREE.Fog(0x0b0a1a, 28, 60);

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
  // Vista elevada (como un tower defense): la torre queda abajo y
  // el camino de los enemigos se ve completo, sin que la torre lo tape.
  camera.position.set(0, 16, 13);
  camera.lookAt(0, 0, -9);
  const posicionCamara = camera.position.clone();   // para volver tras un temblor

  // Modo ligero (index.html?ligero): sin sombras y a menor resolución,
  // para computadores con poca tarjeta gráfica.
  const ligero = new URLSearchParams(location.search).has('ligero');
  const renderer = new THREE.WebGLRenderer({ antialias: !ligero });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(ligero ? 1 : Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = !ligero;
  contenedor.prepend(renderer.domElement);

  // ---------- Luces ----------
  scene.add(new THREE.HemisphereLight(0x9988ff, 0x332244, 1.3));
  const luna = new THREE.DirectionalLight(0xffffff, 1.6);
  luna.position.set(5, 12, 6);
  luna.castShadow = true;
  luna.shadow.camera.left = -15; luna.shadow.camera.right = 15;
  luna.shadow.camera.top = 15; luna.shadow.camera.bottom = -15;
  scene.add(luna);

  // ---------- Suelo y camino ----------
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x1d2a1f })
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.receiveShadow = true;
  scene.add(suelo);

  const camino = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 34),
    new THREE.MeshStandardMaterial({ color: 0x2b2a24 })
  );
  camino.rotation.x = -Math.PI / 2;
  camino.position.set(0, 0.01, -11);
  camino.receiveShadow = true;
  scene.add(camino);

  // ---------- Torre ----------
  const torre = new THREE.Group();
  let alturaTorre = 7, radioTorre = 1.3;
  if (modelos.torre) {
    torre.add(clonarModelo(modelos.torre));
    alturaTorre = modelos.torre.altura;
    radioTorre = modelos.torre.ancho / 2;
  } else {
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a8299 }));
    cuerpo.position.y = 2;
    const techo = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2, 12),
      new THREE.MeshStandardMaterial({ color: 0x5b3fa8 }));
    techo.position.y = 5;
    cuerpo.castShadow = techo.castShadow = true;
    torre.add(cuerpo, techo);
    alturaTorre = 6;
  }
  // Cristal mágico flotando sobre la torre: de aquí salen los hechizos
  const cristal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4),
    new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2299ff, emissiveIntensity: 1.5 })
  );
  cristal.position.y = alturaTorre + 0.9;
  const luzCristal = new THREE.PointLight(0x66ccff, 12, 14);
  luzCristal.position.y = alturaTorre + 0.9;
  torre.add(cristal, luzCristal);
  torre.position.copy(POSICION_TORRE);
  scene.add(torre);

  // ---------- Decorado (árboles y rocas a los lados del camino) ----------
  const azar = (a, b) => a + Math.random() * (b - a);
  const matRoca = new THREE.MeshStandardMaterial({ color: 0x55525e, flatShading: true });
  const matTronco = new THREE.MeshStandardMaterial({ color: 0x4a3426 });
  const matHojas = new THREE.MeshStandardMaterial({ color: 0x1f4d36, flatShading: true });

  function arbolBasico() {
    const arbol = new THREE.Group();
    const alto = azar(2.5, 4.5);
    const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, alto * 0.4, 6), matTronco);
    tronco.position.y = alto * 0.2;
    const copa = new THREE.Mesh(new THREE.ConeGeometry(alto * 0.3, alto * 0.75, 7), matHojas);
    copa.position.y = alto * 0.6;
    tronco.castShadow = copa.castShadow = true;
    arbol.add(tronco, copa);
    return arbol;
  }
  function rocaBasica() {
    const roca = new THREE.Mesh(new THREE.DodecahedronGeometry(azar(0.5, 1.3)), matRoca);
    roca.position.y = 0.3;
    roca.castShadow = true;
    return roca;
  }
  // Elige un modelo cargado o, si no hay, la forma básica
  const decorados = [
    () => (modelos.arbol ? clonarModelo(modelos.arbol) : arbolBasico()),
    () => (modelos.pinos ? clonarModelo(modelos.pinos) : arbolBasico()),
    () => (modelos.pinos ? clonarModelo(modelos.pinos) : arbolBasico()),
    () => (modelos.rocas ? clonarModelo(modelos.rocas) : rocaBasica()),
  ];
  for (let i = 0; i < 30; i++) {
    const lado = i % 2 ? 1 : -1;
    const objeto = decorados[i % decorados.length]();
    objeto.position.x = lado * azar(9.5, 22);
    objeto.position.z = azar(-32, 10);
    objeto.rotation.y = azar(0, Math.PI * 2);
    objeto.scale.multiplyScalar(azar(0.8, 1.3));
    scene.add(objeto);
  }
  // Unas rocas pequeñas al borde del camino
  if (modelos.rocas) {
    for (let i = 0; i < 8; i++) {
      const roca = clonarModelo(modelos.rocas);
      roca.position.set((i % 2 ? 1 : -1) * azar(8, 9), 0, azar(-26, 0));
      roca.rotation.y = azar(0, Math.PI * 2);
      scene.add(roca);
    }
  }

  // ---------- Ajustar al tamaño de la ventana ----------
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---------- Temblor de cámara (cuando golpean la torre) ----------
  let temblor = 0;
  function sacudir(intensidad = 0.25) { temblor = intensidad; }
  function actualizarCamara(delta) {
    if (temblor > 0) {
      camera.position.set(
        posicionCamara.x + (Math.random() - 0.5) * temblor,
        posicionCamara.y + (Math.random() - 0.5) * temblor,
        posicionCamara.z
      );
      temblor = Math.max(0, temblor - delta * 1.2);
      if (temblor === 0) camera.position.copy(posicionCamara);
    }
  }

  return { scene, camera, renderer, torre, cristal, radioTorre, sacudir, actualizarCamara };
}

// =============================================================
// EFECTOS DE PARTÍCULAS (explosiones sencillas)
// Cada partícula es un cubito que sale disparado, cae y se desvanece.
// =============================================================
const geoParticula = new THREE.BoxGeometry(0.15, 0.15, 0.15);

export class Efectos {
  constructor(scene) {
    this.scene = scene;
    this.particulas = [];
  }

  explosion(posicion, color, cantidad = 18, fuerza = 5) {
    for (let i = 0; i < cantidad; i++) {
      const p = new THREE.Mesh(
        geoParticula,
        new THREE.MeshBasicMaterial({ color, transparent: true })
      );
      p.position.copy(posicion);
      p.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * fuerza,
        Math.random() * fuerza * 0.8 + 1,
        (Math.random() - 0.5) * fuerza
      );
      p.userData.vida = p.userData.vidaTotal = 0.5 + Math.random() * 0.4;
      this.scene.add(p);
      this.particulas.push(p);
    }
  }

  actualizar(delta) {
    for (let i = this.particulas.length - 1; i >= 0; i--) {
      const p = this.particulas[i];
      p.userData.vida -= delta;
      if (p.userData.vida <= 0) {
        this.scene.remove(p);
        p.material.dispose();
        this.particulas.splice(i, 1);
        continue;
      }
      p.userData.vel.y -= 9 * delta;                     // gravedad
      p.position.addScaledVector(p.userData.vel, delta);
      p.rotation.x += delta * 8;
      p.material.opacity = p.userData.vida / p.userData.vidaTotal;
    }
  }

  limpiar() {
    for (const p of this.particulas) { this.scene.remove(p); p.material.dispose(); }
    this.particulas = [];
  }
}
