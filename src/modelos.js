// =============================================================
// RUNCASTER – carga de modelos 3D (FBX)
// -------------------------------------------------------------
// Responsable: Katalina (assets) e Isabella (uso en el juego)
//
// Aquí se cargan una sola vez todos los modelos de las carpetas
// Enemigos/ y Escenario/. Luego el juego hace copias (clones) de ellos.
//
// Arreglos que se hacen al cargar cada modelo:
//   1. Opacidad: varios FBX exportados desde Blender traen opacidad 0
//      (serían invisibles). Se pone en 1.
//   2. Material: se cambia a MeshStandardMaterial (mate), que reacciona
//      mejor a las luces de la escena que el material brillante del FBX.
//   3. Tamaño: cada FBX viene en una escala distinta (algunos miden 1500
//      unidades). Se escala para que mida la `altura` indicada y quede
//      apoyado en el suelo (y = 0).
//
// Si un modelo no carga, el juego usa las formas básicas de antes.
// =============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Lista de modelos. `altura` en unidades del juego (la torre mide ~7).
// Para agregar uno nuevo, basta con añadir una línea aquí.
export const LISTA_MODELOS = {
  orco:      { ruta: './Enemigos/Orc.fbx',   altura: 2.2 },
  cangrejo:  { ruta: './Enemigos/Crab.fbx',  altura: 1.6 },
  demonio:   { ruta: './Enemigos/Enemy.fbx', altura: 2.0 },
  torre:     { ruta: './Escenario/Tower.fbx', altura: 7 },
  arbol:     { ruta: './Escenario/Tree.fbx',  altura: 4.5 },
  pinos:     { ruta: './Escenario/Resource_PineTree_Group.fbx', altura: 2 },
  rocas:     { ruta: './Escenario/Rock_3.fbx', altura: 0.7 },
  // Estos necesitan sus imágenes de textura (BaseColor.png, Rocks.png,
  // tiny_treats_texture_1.png) junto al .fbx; sin ellas se ven grises:
  // pino:   { ruta: './Escenario/PineTree.fbx', altura: 4 },
  // rocas2: { ruta: './Escenario/Rocks.fbx',    altura: 1.5 },
  // piso:   { ruta: './Escenario/floor_base.fbx', altura: 0.3 },
};

function arreglarMateriales(objeto) {
  objeto.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const convertir = (m) => new THREE.MeshStandardMaterial({
      name: m.name,
      color: m.color ?? new THREE.Color(0xffffff),
      map: m.map ?? null,
      emissive: m.emissive ?? new THREE.Color(0),
      roughness: 0.85,
      metalness: 0,
      opacity: 1,           // arreglo 1: nada de opacidad 0
      transparent: false,
    });
    o.material = Array.isArray(o.material) ? o.material.map(convertir) : convertir(o.material);
  });
}

// Mete el modelo en un grupo, escalado a `altura` y apoyado en y = 0,
// centrado en x/z. El grupo es lo que el juego mueve.
function normalizar(objeto, altura) {
  objeto.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(objeto);
  const tam = caja.getSize(new THREE.Vector3());
  const escala = altura / (tam.y || 1);
  objeto.scale.multiplyScalar(escala);
  const centro = caja.getCenter(new THREE.Vector3());
  objeto.position.set(-centro.x * escala, -caja.min.y * escala, -centro.z * escala);
  const grupo = new THREE.Group();
  grupo.add(objeto);
  return { grupo, ancho: Math.max(tam.x, tam.z) * escala };
}

// Carga todos los modelos. alProgreso(cargados, total) sirve para la pantalla de carga.
export async function cargarModelos(alProgreso = () => {}) {
  const cargador = new FBXLoader();
  const nombres = Object.keys(LISTA_MODELOS);
  const modelos = {};
  let cargados = 0;
  await Promise.all(nombres.map(async (nombre) => {
    const { ruta, altura } = LISTA_MODELOS[nombre];
    try {
      const objeto = await cargador.loadAsync(ruta);
      const animaciones = objeto.animations;
      arreglarMateriales(objeto);
      const { grupo, ancho } = normalizar(objeto, altura);
      modelos[nombre] = { grupo, animaciones, altura, ancho };
    } catch (e) {
      console.warn(`No se pudo cargar ${ruta}; se usará una forma básica.`, e);
      modelos[nombre] = null;
    }
    alProgreso(++cargados, nombres.length);
  }));
  return modelos;
}

// Copia independiente de un modelo. SkeletonUtils.clone es necesario para
// los modelos animados (con esqueleto): un clone() normal los rompe.
export function clonarModelo(modelo) {
  return SkeletonUtils.clone(modelo.grupo);
}

// Busca una animación por nombre aproximado: 'Walk' encuentra
// 'CharacterArmature|Walk' o 'MonsterArmature|Walk'.
export function buscarAnimacion(animaciones, nombre) {
  return animaciones.find((a) => a.name.split('|').pop().toLowerCase() === nombre.toLowerCase())
    ?? animaciones.find((a) => a.name.toLowerCase().includes(nombre.toLowerCase()));
}
