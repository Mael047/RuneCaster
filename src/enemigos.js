// =============================================================
// RUNCASTER – los 3 tipos de enemigo
// -------------------------------------------------------------
// Regla de diseño: la FORMA y el COLOR del enemigo dicen qué runa lo vence.
//   Orbe  (esfera, azul)       -> runa círculo  ◯
//   Lanza (barra, amarilla)    -> runa línea    ─
//   Pico  (pirámide, rosada)   -> runa triángulo △
// Así el jugador no tiene que memorizar una tabla: dibuja lo que ve.
//
// Por ahora son formas básicas. Cuando haya modelos 3D, basta con
// cambiar crearMalla() de cada tipo.
// =============================================================

import * as THREE from 'three';

export const TIPOS = {
  circulo: {
    nombre: 'Orbe', plural: 'Orbes', simbolo: '◯', color: 0x66e0ff,
    velocidad: [1.6, 2.0], puntos: 10, danio: 10,
    crearMalla(mat) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), mat);
      m.position.y = 0.9;
      return m;
    },
  },
  linea: {
    nombre: 'Lanza', plural: 'Lanzas', simbolo: '─', color: 0xffd23f,
    velocidad: [2.4, 2.9], puntos: 15, danio: 10,          // la más rápida
    crearMalla(mat) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.3), mat);
      m.position.y = 0.9;
      return m;
    },
  },
  triangulo: {
    nombre: 'Pico', plural: 'Picos', simbolo: '△', color: 0xff5fd2,
    velocidad: [1.1, 1.4], puntos: 20, danio: 20,          // lenta pero pega fuerte
    crearMalla(mat) {
      // Un cono de 3 lados es una pirámide triangular
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 3), mat);
      m.position.y = 0.7;
      return m;
    },
  },
};

// Un material por tipo, compartido por todos los enemigos de ese tipo
const materiales = {};
for (const [clave, tipo] of Object.entries(TIPOS)) {
  materiales[clave] = new THREE.MeshStandardMaterial({
    color: tipo.color,
    emissive: tipo.color,
    emissiveIntensity: 0.35,     // brillan un poco para leerse de noche
    flatShading: true,
  });
}

export function crearEnemigo(clave, posicion, multiplicadorVelocidad = 1) {
  const tipo = TIPOS[clave];
  const enemigo = new THREE.Group();
  const malla = tipo.crearMalla(materiales[clave]);
  malla.castShadow = true;
  enemigo.add(malla);
  enemigo.position.copy(posicion);
  enemigo.scale.setScalar(1.3);          // un poco más grandes, para leerlos desde lejos
  const [min, max] = tipo.velocidad;
  enemigo.userData = {
    tipo: clave,
    malla,
    alturaBase: malla.position.y,
    velocidad: THREE.MathUtils.randFloat(min, max) * multiplicadorVelocidad,
    fase: Math.random() * Math.PI * 2,   // para que no se muevan todos igual
    apuntado: false,                     // ya tiene un hechizo en camino
  };
  return enemigo;
}

// Pequeña animación propia de cada tipo
export function animarEnemigo(enemigo, delta, tiempo) {
  const d = enemigo.userData, m = d.malla;
  if (d.tipo === 'circulo') {
    m.position.y = d.alturaBase + Math.abs(Math.sin(tiempo * 4 + d.fase)) * 0.4;  // rebota
  } else if (d.tipo === 'linea') {
    m.rotation.y += delta * 3;                                                     // gira
    m.position.y = d.alturaBase + Math.sin(tiempo * 3 + d.fase) * 0.15;
  } else {
    m.rotation.y = Math.sin(tiempo * 2 + d.fase) * 0.4;                            // se balancea
  }
}

// Punto donde debe impactar un hechizo (el centro de la figura)
export function centroEnemigo(enemigo, destino = new THREE.Vector3()) {
  return enemigo.userData.malla.getWorldPosition(destino);
}
