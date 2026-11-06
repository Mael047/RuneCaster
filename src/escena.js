// =============================================================
// RUNCASTER – escena 3D: cámara, luces, suelo, torre, decorado y efectos
// Responsables: Katalina (lo visual) e Isabella (lo que usa el juego)
//
// Todo lo que se ve aquí son formas básicas de Three.js. Cuando lleguen
// los modelos de Kenney/Quaternius, se reemplazan en este archivo.
// =============================================================

import * as THREE from 'three';

export const POSICION_TORRE = new THREE.Vector3(0, 0, 4);

export function crearEscena(contenedor = document.body) {
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
  scene.add(new THREE.HemisphereLight(0x8877ff, 0x221133, 0.7));
  const luna = new THREE.DirectionalLight(0xffffff, 1.1);
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
  const piedra = new THREE.MeshStandardMaterial({ color: 0x8a8299 });
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 4, 12), piedra);
  cuerpo.position.y = 2;
  const techo = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 2, 12),
    new THREE.MeshStandardMaterial({ color: 0x5b3fa8 })
  );
  techo.position.y = 5;
  const cristal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35),
    new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2299ff, emissiveIntensity: 1.5 })
  );
  cristal.position.y = 6.6;
  const luzCristal = new THREE.PointLight(0x66ccff, 8, 10);
  luzCristal.position.y = 6.6;
  for (const m of [cuerpo, techo]) m.castShadow = true;
  torre.add(cuerpo, techo, cristal, luzCristal);
  torre.position.copy(POSICION_TORRE);
  scene.add(torre);

  // ---------- Decorado (rocas y árboles a los lados del camino) ----------
  const matRoca = new THREE.MeshStandardMaterial({ color: 0x55525e, flatShading: true });
  const matTronco = new THREE.MeshStandardMaterial({ color: 0x4a3426 });
  const matHojas = new THREE.MeshStandardMaterial({ color: 0x1f4d36, flatShading: true });
  const azar = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 26; i++) {
    const lado = i % 2 ? 1 : -1;
    const x = lado * azar(9.5, 20), z = azar(-30, 8);
    if (i % 3 === 0) {
      const roca = new THREE.Mesh(new THREE.DodecahedronGeometry(azar(0.5, 1.3)), matRoca);
      roca.position.set(x, 0.3, z);
      roca.rotation.set(azar(0, 3), azar(0, 3), 0);
      roca.castShadow = true;
      scene.add(roca);
    } else {
      const arbol = new THREE.Group();
      const alto = azar(2.5, 4.5);
      const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, alto * 0.4, 6), matTronco);
      tronco.position.y = alto * 0.2;
      const copa = new THREE.Mesh(new THREE.ConeGeometry(alto * 0.3, alto * 0.75, 7), matHojas);
      copa.position.y = alto * 0.6;
      tronco.castShadow = copa.castShadow = true;
      arbol.add(tronco, copa);
      arbol.position.set(x, 0, z);
      scene.add(arbol);
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

  return { scene, camera, renderer, torre, cristal, sacudir, actualizarCamara };
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
