// =============================================================
// RUNCASTER – escena base en Three.js
// -------------------------------------------------------------
// Toda app de Three.js tiene 4 piezas:
//   1. Escena    (scene)    -> el "mundo" donde se ponen los objetos
//   2. Cámara    (camera)   -> desde dónde miramos ese mundo
//   3. Renderer  (renderer) -> dibuja lo que ve la cámara en un <canvas>
//   4. Bucle     (animate)  -> se repite ~60 veces por segundo para animar
// Y los objetos visibles son "Mesh" = forma (geometry) + apariencia (material).
// =============================================================

import * as THREE from 'three';

// ---------- 1. ESCENA ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a1a);      // cielo nocturno
scene.fog = new THREE.Fog(0x0b0a1a, 20, 45);        // niebla: lo lejano se desvanece

// ---------- 2. CÁMARA (fija) ----------
// PerspectiveCamera(ángulo de visión, proporción ancho/alto, distancia mínima, distancia máxima)
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 6, 12);   // x = izquierda/derecha, y = altura, z = hacia el jugador
camera.lookAt(0, 1, -6);         // hacia dónde mira

// ---------- 3. RENDERER ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;                  // activar sombras
document.body.appendChild(renderer.domElement);     // mete el <canvas> en la página

// ---------- LUCES ----------
// Sin luces, los materiales "Standard" se ven negros.
const luzAmbiente = new THREE.HemisphereLight(0x8877ff, 0x221133, 0.6); // luz suave general
scene.add(luzAmbiente);

const luna = new THREE.DirectionalLight(0xffffff, 1.2); // luz tipo sol/luna, proyecta sombras
luna.position.set(5, 10, 5);
luna.castShadow = true;
scene.add(luna);

// ---------- SUELO ----------
const suelo = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x1d2a1f })
);
suelo.rotation.x = -Math.PI / 2;   // el plano nace vertical; lo acostamos 90°
suelo.receiveShadow = true;
scene.add(suelo);

// ---------- TORRE ----------
// Un "Group" junta varias piezas para moverlas como una sola.
const torre = new THREE.Group();

const cuerpo = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1.3, 4, 12),        // radio arriba, radio abajo, alto, lados
  new THREE.MeshStandardMaterial({ color: 0x8a8299 })
);
cuerpo.position.y = 2;             // la mitad del alto, para que quede sobre el suelo
cuerpo.castShadow = true;

const techo = new THREE.Mesh(
  new THREE.ConeGeometry(1.5, 2, 12),
  new THREE.MeshStandardMaterial({ color: 0x5b3fa8 })
);
techo.position.y = 5;
techo.castShadow = true;

const cristal = new THREE.Mesh(                    // cristal mágico flotando en la punta
  new THREE.OctahedronGeometry(0.35),
  new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2299ff, emissiveIntensity: 1.5 })
);
cristal.position.y = 6.6;

torre.add(cuerpo, techo, cristal);
torre.position.set(0, 0, 4);       // la torre queda cerca del jugador
scene.add(torre);

// ---------- ENEMIGOS ----------
// Por ahora son cubos (modelos provisionales, como dice el cronograma).
const enemigos = [];
const geoEnemigo = new THREE.BoxGeometry(0.8, 0.8, 0.8);

function crearEnemigo() {
  const enemigo = new THREE.Mesh(
    geoEnemigo,
    new THREE.MeshStandardMaterial({ color: 0xd94a4a })
  );
  // Aparece lejos (z negativo) en una posición horizontal al azar
  enemigo.position.set(THREE.MathUtils.randFloatSpread(14), 0.4, -25);
  enemigo.castShadow = true;
  enemigo.userData.velocidad = THREE.MathUtils.randFloat(1.5, 2.5); // unidades por segundo
  scene.add(enemigo);
  enemigos.push(enemigo);
}

function eliminarEnemigo(enemigo) {
  scene.remove(enemigo);
  enemigo.material.dispose();      // liberar memoria de la tarjeta gráfica
  enemigos.splice(enemigos.indexOf(enemigo), 1);
}

// ---------- ESTADO DEL JUEGO ----------
let vida = 100;
let puntaje = 0;
let tiempoDesdeUltimoEnemigo = 0;
const intervaloAparicion = 2;      // segundos entre enemigos
const elVida = document.getElementById('vida');
const elPuntaje = document.getElementById('puntaje');

// ---------- "RUNAS" SIMULADAS CON TECLADO ----------
// Más adelante esto lo reemplaza el reconocedor $1 con la varita.
// Cada runa tiene un color; el hechizo va al enemigo más cercano (lock-on).
const RUNAS = {
  '1': { nombre: 'círculo',   color: 0x66e0ff },
  '2': { nombre: 'línea',     color: 0xffd23f },
  '3': { nombre: 'triángulo', color: 0xff5fd2 },
};

function enemigoMasCercano() {
  let masCercano = null;
  let menorDistancia = Infinity;
  for (const e of enemigos) {
    const d = e.position.distanceTo(torre.position);
    if (d < menorDistancia) { menorDistancia = d; masCercano = e; }
  }
  return masCercano;
}

// Proyectiles en vuelo: una esfera que viaja del cristal al enemigo
const proyectiles = [];

function lanzarHechizo(runa) {
  const objetivo = enemigoMasCercano();
  if (!objetivo) return;
  const bola = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 12, 12),
    new THREE.MeshBasicMaterial({ color: runa.color })  // "Basic" ignora la luz: se ve brillante
  );
  cristal.getWorldPosition(bola.position);              // sale desde el cristal de la torre
  scene.add(bola);
  proyectiles.push({ bola, objetivo });
}

window.addEventListener('keydown', (evento) => {
  const runa = RUNAS[evento.key];
  if (runa) lanzarHechizo(runa);
});

// ---------- 4. BUCLE DE ANIMACIÓN ----------
const reloj = new THREE.Clock();   // mide el tiempo entre cuadros

function animate() {
  // delta = segundos desde el cuadro anterior. Multiplicar velocidades por delta
  // hace que el juego vaya igual de rápido en un PC lento que en uno rápido.
  const delta = reloj.getDelta();

  // Hacer girar el cristal
  cristal.rotation.y += delta * 2;

  // Aparición de enemigos cada cierto tiempo
  tiempoDesdeUltimoEnemigo += delta;
  if (tiempoDesdeUltimoEnemigo > intervaloAparicion && vida > 0) {
    crearEnemigo();
    tiempoDesdeUltimoEnemigo = 0;
  }

  // Mover cada enemigo hacia la torre
  for (const e of [...enemigos]) {
    const direccion = new THREE.Vector3().subVectors(torre.position, e.position);
    direccion.y = 0;
    const distancia = direccion.length();
    if (distancia < 1.5) {          // llegó a la torre: hace daño y desaparece
      vida = Math.max(0, vida - 10);
      elVida.textContent = vida;
      eliminarEnemigo(e);
      continue;
    }
    direccion.normalize();
    e.position.addScaledVector(direccion, e.userData.velocidad * delta);
    e.rotation.y += delta;          // que giren un poco, para darles vida
  }

  // Mover proyectiles hacia su objetivo
  for (const p of [...proyectiles]) {
    const objetivoVivo = enemigos.includes(p.objetivo);
    const destino = objetivoVivo ? p.objetivo.position : p.bola.position;
    const dir = new THREE.Vector3().subVectors(destino, p.bola.position);
    if (!objetivoVivo || dir.length() < 0.5) {
      if (objetivoVivo) {           // impacto
        eliminarEnemigo(p.objetivo);
        puntaje += 10;
        elPuntaje.textContent = puntaje;
      }
      scene.remove(p.bola);
      proyectiles.splice(proyectiles.indexOf(p), 1);
      continue;
    }
    p.bola.position.addScaledVector(dir.normalize(), 18 * delta);
  }

  renderer.render(scene, camera);   // dibujar el cuadro
  requestAnimationFrame(animate);   // pedir el siguiente cuadro
}
animate();

// ---------- AJUSTAR AL TAMAÑO DE LA VENTANA ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
