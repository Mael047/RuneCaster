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
  // Noche de luna: azul profundo (no negro). La niebla del mismo color hace
  // que el fondo del camino se funda con el cielo.
  const COLOR_NOCHE = 0x1c2550;
  scene.background = new THREE.Color(COLOR_NOCHE);
  scene.fog = new THREE.Fog(COLOR_NOCHE, 30, 72);

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
  // Tono "de cine": colores más vivos y luces que no se queman
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  contenedor.prepend(renderer.domElement);

  // ---------- Luces ----------
  // Luz de ambiente: cielo azul lavanda arriba, reflejo verdoso del pasto abajo
  scene.add(new THREE.HemisphereLight(0xa6b8ff, 0x3a4a3a, 1.8));
  // Luna: luz blanca azulada, más fuerte para que se vean los modelos
  const luna = new THREE.DirectionalLight(0xd4ddff, 2.4);
  luna.position.set(5, 12, 6);
  luna.castShadow = true;
  luna.shadow.camera.left = -15; luna.shadow.camera.right = 15;
  luna.shadow.camera.top = 15; luna.shadow.camera.bottom = -15;
  scene.add(luna);

  // ---------- Suelo y camino ----------
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x2f4d36 })   // pasto a la luz de la luna
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.receiveShadow = true;
  scene.add(suelo);

  const camino = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 70),
    new THREE.MeshStandardMaterial({ color: 0x4d4436 })   // tierra
  );
  camino.rotation.x = -Math.PI / 2;
  camino.position.set(0, 0.01, -29);                       // de z = -64 hasta la torre
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
  // Tipos de decorado: modelo cargado o, si no hay, la forma básica.
  // El tipo se elige al azar con estos pesos (igual en los dos lados).
  const TIPOS_DECORADO = [
    { peso: 3, crear: () => (modelos.arbol ? clonarModelo(modelos.arbol) : arbolBasico()) },
    { peso: 5, crear: () => (modelos.pinos ? clonarModelo(modelos.pinos) : arbolBasico()) },
    { peso: 2, crear: () => (modelos.rocas ? clonarModelo(modelos.rocas) : rocaBasica()) },
  ];
  const pesoTotal = TIPOS_DECORADO.reduce((t, d) => t + d.peso, 0);
  function decoradoAlAzar() {
    let r = Math.random() * pesoTotal;
    for (const d of TIPOS_DECORADO) { if ((r -= d.peso) < 0) return d.crear(); }
    return TIPOS_DECORADO[0].crear();
  }
  // Bosque disperso: en cada lado, una cuadrícula con un poco de azar en cada
  // celda (y algunas celdas vacías). Así queda parejo y sin montones.
  const PASO_Z = 6, PASO_X = 4.8, VACIAS = 0.3;
  for (const lado of [-1, 1]) {
    for (let z = -48; z < 12; z += PASO_Z) {
      for (let x = 10; x < 28; x += PASO_X) {
        if (Math.random() < VACIAS) continue;
        const objeto = decoradoAlAzar();
        objeto.position.set(lado * (x + azar(0, PASO_X * 0.7)), 0, z + azar(0, PASO_Z * 0.8));
        objeto.rotation.y = azar(0, Math.PI * 2);
        objeto.scale.multiplyScalar(azar(0.8, 1.3));
        scene.add(objeto);
      }
    }
  }
  // Piedras que marcan el borde del camino, a ambos lados
  const matBorde = new THREE.MeshStandardMaterial({ color: 0x8a8796, flatShading: true });
  const geoBorde = new THREE.DodecahedronGeometry(0.35);
  for (let z = -46; z < 2; z += azar(1.6, 2.6)) {
    for (const lado of [-1, 1]) {
      const piedra = new THREE.Mesh(geoBorde, matBorde);
      piedra.position.set(lado * azar(8.1, 8.6), 0.12, z + azar(-0.4, 0.4));
      piedra.rotation.set(azar(0, 3), azar(0, 3), 0);
      piedra.scale.setScalar(azar(0.6, 1.3));
      piedra.castShadow = true;
      scene.add(piedra);
    }
  }
  // Algunos grupos de rocas pequeñas junto al camino
  if (modelos.rocas) {
    for (let i = 0; i < 10; i++) {
      const roca = clonarModelo(modelos.rocas);
      roca.position.set((i % 2 ? 1 : -1) * azar(9, 10.5), 0, azar(-40, 2));
      roca.rotation.y = azar(0, Math.PI * 2);
      scene.add(roca);
    }
  }

  // ---------- Luciérnagas ----------
  // Puntos de luz amarilla que flotan despacio sobre el pasto
  const LUCIERNAGAS = 90;
  const posiciones = new Float32Array(LUCIERNAGAS * 3);
  const base = [];
  for (let i = 0; i < LUCIERNAGAS; i++) {
    const lado = Math.random() < 0.5 ? -1 : 1;
    const b = { x: lado * azar(7, 24), y: azar(0.6, 3.5), z: azar(-46, 10), fase: azar(0, 6.3), vel: azar(0.4, 1) };
    base.push(b);
    posiciones.set([b.x, b.y, b.z], i * 3);
  }
  const geoLuz = new THREE.BufferGeometry();
  geoLuz.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  const brillo = document.createElement('canvas');
  brillo.width = brillo.height = 64;
  const cb = brillo.getContext('2d');
  const grad = cb.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,220,1)');
  grad.addColorStop(0.3, 'rgba(255,240,140,.8)');
  grad.addColorStop(1, 'rgba(255,230,100,0)');
  cb.fillStyle = grad; cb.fillRect(0, 0, 64, 64);
  const luciernagas = new THREE.Points(geoLuz, new THREE.PointsMaterial({
    size: 0.55, map: new THREE.CanvasTexture(brillo), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0a0,
  }));
  scene.add(luciernagas);
  let tiempoLuz = 0;
  function moverLuciernagas(delta) {
    tiempoLuz += delta;
    for (let i = 0; i < LUCIERNAGAS; i++) {
      const b = base[i], t = tiempoLuz * b.vel + b.fase;
      posiciones[i * 3] = b.x + Math.sin(t * 0.7) * 0.8;
      posiciones[i * 3 + 1] = b.y + Math.sin(t * 1.3) * 0.4;
      posiciones[i * 3 + 2] = b.z + Math.cos(t * 0.5) * 0.8;
    }
    geoLuz.attributes.position.needsUpdate = true;
    // parpadeo suave de todas juntas
    luciernagas.material.opacity = 0.75 + Math.sin(tiempoLuz * 2) * 0.25;
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
  // Se llama cada cuadro: mueve las luciérnagas y aplica el temblor
  function actualizarCamara(delta) {
    moverLuciernagas(delta);
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
