// =============================================================
// RUNCASTER – reconocimiento de runas
// -------------------------------------------------------------
// Responsable: Santiago Peñalosa
//
// Dos piezas:
//   1. SegmentadorTrazos: decide cuándo EMPIEZA y cuándo TERMINA una runa.
//      En el aire no hay "lápiz levantado", así que usamos el movimiento:
//      empieza cuando el punto se mueve rápido y termina cuando se queda
//      quieto un momento (o cuando se pierde de vista).
//   2. reconocerRuna(): recibe los puntos del trazo y dice qué runa es:
//      'circulo', 'linea', 'triangulo', o null si no se parece a ninguna
//      (el "fallo amable" de la ficha).
//
// El círculo y el triángulo se reconocen con el algoritmo $1 Unistroke
// Recognizer (Wobbrock, Wilson y Li, 2007). La línea se reconoce aparte,
// porque $1 estira cada trazo hasta un cuadrado y una línea estirada
// deja de parecer línea (el mismo artículo de $1 menciona esta limitación).
// =============================================================

// ---------- Ajustes ----------
export const AJUSTES = {
  puntajeMinimo: 0.78,     // por debajo de esto, la runa se rechaza (0 a 1)
  delgadezLinea: 0.15,     // grosor/largo del trazo por debajo del cual es línea
  tamanoMinimo: 0.12,      // tamaño mínimo del trazo (fracción de la pantalla)
  aspecto: 4 / 3,          // ancho/alto de la cámara: corrige el estiramiento
};

// ---------- Utilidades geométricas ----------
const distancia = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function largoTrazo(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += distancia(pts[i - 1], pts[i]);
  return d;
}

function caja(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, ancho: maxX - minX, alto: maxY - minY };
}

function centroide(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

// Relación entre el "grosor" y el "largo" de la nube de puntos:
// cerca de 0 = línea, cerca de 1 = forma redonda.
function delgadezTrazo(pts) {
  const uniformes = remuestrear(pts, 32);   // para que la velocidad no influya
  const c = centroide(uniformes);
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of uniformes) {
    const dx = p.x - c.x, dy = p.y - c.y;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const traza = sxx + syy, det = sxx * syy - sxy * sxy;
  const raiz = Math.sqrt(Math.max(0, (traza * traza) / 4 - det));
  const mayor = traza / 2 + raiz, menor = traza / 2 - raiz;
  return mayor > 0 ? Math.sqrt(Math.max(0, menor) / mayor) : 1;
}

// =============================================================
// $1 UNISTROKE RECOGNIZER
// Pasos: remuestrear -> rotar -> escalar -> centrar -> comparar con plantillas
// =============================================================
const N = 64;                          // puntos tras remuestrear
const TAMANO = 250;                    // lado del cuadrado de referencia
const MEDIA_DIAGONAL = 0.5 * Math.hypot(TAMANO, TAMANO);
const RANGO_ANGULO = (45 * Math.PI) / 180;
const PRECISION_ANGULO = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5)); // razón áurea, para buscar el mejor ángulo

// 1. Remuestrear: N puntos equidistantes, sin importar la velocidad del trazo
function remuestrear(puntos, n = N) {
  const pts = puntos.map((p) => ({ ...p }));
  const paso = largoTrazo(pts) / (n - 1);
  let acumulado = 0;
  const nuevos = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = distancia(pts[i - 1], pts[i]);
    if (acumulado + d >= paso && d > 0) {
      const t = (paso - acumulado) / d;
      const q = {
        x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
      };
      nuevos.push(q);
      pts.splice(i, 0, q);   // q es el nuevo punto de partida
      acumulado = 0;
    } else {
      acumulado += d;
    }
  }
  while (nuevos.length < n) nuevos.push({ ...pts[pts.length - 1] });
  return nuevos.slice(0, n);
}

function rotar(pts, angulo) {
  const c = centroide(pts), cos = Math.cos(angulo), sin = Math.sin(angulo);
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

// 2. Rotar para que el primer punto quede a 0° del centro ("ángulo indicativo")
function rotarACero(pts) {
  const c = centroide(pts);
  return rotar(pts, -Math.atan2(pts[0].y - c.y, pts[0].x - c.x));
}

// 3. Escalar a un cuadrado de referencia
function escalar(pts) {
  const b = caja(pts);
  const ancho = b.ancho || 1e-6, alto = b.alto || 1e-6;
  return pts.map((p) => ({ x: (p.x * TAMANO) / ancho, y: (p.y * TAMANO) / alto }));
}

// 4. Centrar en el origen
function centrar(pts) {
  const c = centroide(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

const normalizar = (pts) => centrar(escalar(rotarACero(remuestrear(pts))));

function distanciaCamino(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += distancia(a[i], b[i]);
  return d / a.length;
}

// 5. Buscar el ángulo (entre -45° y 45°) en que el trazo más se parece a la plantilla
function distanciaMejorAngulo(pts, plantilla) {
  let a = -RANGO_ANGULO, b = RANGO_ANGULO;
  let x1 = PHI * a + (1 - PHI) * b, f1 = distanciaCamino(rotar(pts, x1), plantilla);
  let x2 = (1 - PHI) * a + PHI * b, f2 = distanciaCamino(rotar(pts, x2), plantilla);
  while (Math.abs(b - a) > PRECISION_ANGULO) {
    if (f1 < f2) {
      b = x2; x2 = x1; f2 = f1;
      x1 = PHI * a + (1 - PHI) * b; f1 = distanciaCamino(rotar(pts, x1), plantilla);
    } else {
      a = x1; x1 = x2; f1 = f2;
      x2 = (1 - PHI) * a + PHI * b; f2 = distanciaCamino(rotar(pts, x2), plantilla);
    }
  }
  return Math.min(f1, f2);
}

// ---------- Plantillas ----------
// Se generan con matemáticas (no hay que dibujarlas a mano). Incluimos
// ambos sentidos de giro y varios puntos de inicio, porque cada persona
// dibuja distinto.
function poligono(vertices, pasosPorLado = 20) {
  const pts = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    for (let k = 0; k < pasosPorLado; k++) {
      const t = k / pasosPorLado;
      pts.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  pts.push({ ...vertices[0] });
  return pts;
}

function generarPlantillas() {
  const plantillas = [];
  const agregar = (nombre, pts) => {
    plantillas.push({ nombre, puntos: normalizar(pts) });
    plantillas.push({ nombre, puntos: normalizar([...pts].reverse()) }); // otro sentido
  };

  // Círculo: empezando en 4 puntos distintos
  for (let inicio = 0; inicio < 4; inicio++) {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (inicio * Math.PI) / 2 + (i / 64) * Math.PI * 2;
      pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    agregar('circulo', pts);
  }

  // Triángulo: punta arriba y punta abajo, empezando en cada vértice
  const arriba = [{ x: 0, y: -1 }, { x: 0.9, y: 0.7 }, { x: -0.9, y: 0.7 }];
  const abajo = arriba.map((p) => ({ x: p.x, y: -p.y }));
  for (const tri of [arriba, abajo]) {
    for (let inicio = 0; inicio < 3; inicio++) {
      const v = [...tri.slice(inicio), ...tri.slice(0, inicio)];
      agregar('triangulo', poligono(v));
    }
  }

  // "Señuelo": un cuadrado se parece más a un círculo que a un triángulo.
  // Con esta plantilla, si alguien dibuja un cuadrado se rechaza en vez de
  // lanzar un círculo por error. (Si algún día hay runa cuadrada, se renombra.)
  const cuadrado = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];
  for (let inicio = 0; inicio < 4; inicio++) {
    const v = [...cuadrado.slice(inicio), ...cuadrado.slice(0, inicio)];
    agregar('_cuadrado', poligono(v));
  }
  return plantillas;
}

const PLANTILLAS = generarPlantillas();

// ---------- Reconocedor ----------
// Devuelve { runa, puntaje, motivo }
//   runa:    'circulo' | 'linea' | 'triangulo' | null
//   puntaje: 0 a 1 (qué tan parecido es)
//   motivo:  explicación cuando se rechaza (útil para el "fallo amable")
export function reconocerRuna(puntosOriginales) {
  if (!puntosOriginales || puntosOriginales.length < 8) {
    return { runa: null, puntaje: 0, motivo: 'trazo muy corto' };
  }
  // Corregir el aspecto de la cámara (4:3), para que un círculo real se vea redondo
  const pts = puntosOriginales.map((p) => ({ x: p.x * AJUSTES.aspecto, y: p.y }));
  const b = caja(pts);
  const tamano = Math.max(b.ancho, b.alto);
  if (tamano < AJUSTES.tamanoMinimo) {
    return { runa: null, puntaje: 0, motivo: 'trazo muy pequeño' };
  }

  // Línea: los puntos forman una franja delgada. Medimos qué tan "gruesa" es
  // la nube de puntos respecto a su largo (análisis de componentes principales).
  // Esto tolera el temblor de la mano mejor que comparar largos.
  const delgadez = delgadezTrazo(pts);
  if (delgadez <= AJUSTES.delgadezLinea) {
    return { runa: 'linea', puntaje: 1 - delgadez, motivo: '' };
  }

  // Círculo o triángulo con $1
  const candidato = normalizar(pts);
  let mejor = Infinity, nombre = null;
  for (const plantilla of PLANTILLAS) {
    const d = distanciaMejorAngulo(candidato, plantilla.puntos);
    if (d < mejor) { mejor = d; nombre = plantilla.nombre; }
  }
  const puntaje = 1 - mejor / MEDIA_DIAGONAL;
  if (puntaje < AJUSTES.puntajeMinimo || nombre.startsWith('_')) {
    return { runa: null, puntaje, motivo: 'no se parece a ninguna runa' };
  }
  return { runa: nombre, puntaje, motivo: '' };
}

// =============================================================
// SEGMENTADOR DE TRAZOS
// Se le pasa el punto de cada cuadro (o null). Cuando una runa termina,
// llama a alTerminar(puntos).
//
// En el aire no hay "lápiz levantado", así que la runa termina con
// cualquiera de estas tres señales (la que llegue primero):
//   1. CIERRE: en figuras cerradas (círculo, triángulo), cuando la mano
//      vuelve al punto donde empezó. No hay que esperar ni sacar la mano.
//   2. PAUSA: la mano se queda quieta (dentro de un radio pequeño) un
//      momento. Se mide con un radio y no con la velocidad, porque la
//      detección tiembla y la velocidad casi nunca llega a cero.
//      Los puntos de la pausa se quitan del trazo.
//   3. SE PIERDE: el punto desaparece. Se quitan los últimos puntos,
//      que suelen ser el movimiento de salida de la cámara.
//
// Después de cada runa hay un tiempo de espera (`tiempoEspera`) en el que
// no puede empezar otra, para que el movimiento con el que se termina una
// figura no se convierta en el inicio de la siguiente.
// =============================================================
export class SegmentadorTrazos {
  constructor({ alTerminar, alEmpezar } = {}) {
    this.alTerminar = alTerminar || (() => {});
    this.alEmpezar = alEmpezar || (() => {});
    // Distancias en fracciones de la pantalla; tiempos en milisegundos
    this.velocidadInicio = 0.25;  // pantallas/segundo para empezar la runa
    this.radioQuieto = 0.03;      // moverse menos que esto cuenta como "quieto"
    this.tiempoPausa = 280;       // ms quieto para dar la runa por terminada
    this.cierreAutomatico = true; // terminar al volver al punto de inicio
    this.tiempoPerdido = 150;     // ms sin ver el punto para terminarla
    this.recorteSalida = 150;     // ms finales que se descartan si el punto se pierde
    this.tiempoMaximo = 4000;     // ninguna runa dura más que esto
    this.tiempoEspera = 700;      // ms tras una runa antes de poder empezar otra
    this.esperaHasta = 0;
    this.reiniciar();
  }

  reiniciar() {
    this.dibujando = false;
    this.puntos = [];            // { x, y, t }
    this.historial = [];         // últimos puntos antes de empezar
    this.ancla = null;           // dónde empezó la quietud actual
    this.indiceQuieto = 0;
    this.perdidoDesde = null;
    this.largo = 0;              // recorrido total del trazo
    this.maxLejos = 0;           // máxima distancia alcanzada desde el inicio
  }

  // true mientras corre el tiempo de espera tras una runa
  enEspera(ahora = performance.now()) { return ahora < this.esperaHasta; }

  // Llamar una vez por cuadro. `ahora` en milisegundos (performance.now()).
  actualizar(punto, ahora = performance.now()) {
    this.ahora = ahora;
    if (!punto) {
      this.historial = [];
      if (this.dibujando) {
        this.perdidoDesde ??= ahora;
        if (ahora - this.perdidoDesde > this.tiempoPerdido) {
          const ultimo = this.puntos.at(-1)?.t ?? ahora;
          this.#terminar(this.puntos.filter((p) => p.t <= ultimo - this.recorteSalida), 'perdido');
        }
      }
      return;
    }
    this.perdidoDesde = null;
    const p = { x: punto.x, y: punto.y, t: ahora };

    // ---- Esperando a que empiece una runa ----
    if (!this.dibujando) {
      if (this.enEspera(ahora)) return;     // todavía no se puede empezar otra
      this.historial.push(p);
      while (this.historial.length && ahora - this.historial[0].t > 150) this.historial.shift();
      // Velocidad medida sobre ~150 ms (más estable que cuadro a cuadro)
      const viejo = this.historial[0];
      const dt = (ahora - viejo.t) / 1000;
      if (dt > 0.05 && distancia(viejo, p) / dt > this.velocidadInicio) {
        this.dibujando = true;
        this.puntos = [...this.historial];  // incluir el arranque del movimiento
        this.historial = [];
        this.largo = largoTrazo(this.puntos);
        this.maxLejos = Math.max(...this.puntos.map((q) => distancia(this.puntos[0], q)));
        this.ancla = p; this.indiceQuieto = this.puntos.length - 1;
        this.alEmpezar();
      }
      return;
    }

    // ---- Dibujando ----
    this.largo += distancia(this.puntos.at(-1), p);
    this.puntos.push(p);
    const inicio = this.puntos[0];
    const lejos = distancia(inicio, p);
    this.maxLejos = Math.max(this.maxLejos, lejos);

    // 1. Cierre: volvió cerca del inicio tras recorrer una figura
    if (this.cierreAutomatico && this.maxLejos > 0.1 &&
        this.largo > 2.4 * this.maxLejos &&
        lejos < Math.max(0.04, 0.2 * this.maxLejos)) {
      return this.#terminar(this.puntos, 'cierre');
    }

    // 2. Pausa: sigue dentro del radio de quietud
    if (distancia(this.ancla, p) > this.radioQuieto) {
      this.ancla = p;
      this.indiceQuieto = this.puntos.length - 1;
    } else if (ahora - this.ancla.t >= this.tiempoPausa) {
      return this.#terminar(this.puntos.slice(0, this.indiceQuieto + 1), 'pausa');
    }

    if (ahora - inicio.t > this.tiempoMaximo) this.#terminar(this.puntos, 'tiempo');
  }

  #terminar(puntos, motivo) {
    this.reiniciar();
    this.esperaHasta = this.ahora + this.tiempoEspera;
    this.alTerminar(puntos.map(({ x, y }) => ({ x, y })), motivo);
  }
}
