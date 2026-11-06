// =============================================================
// RUNCASTER – filtro "One Euro" para quitar el temblor del punto
// -------------------------------------------------------------
// Problema: la detección de la mano (o del color) "tiembla" unos píxeles
// en cada cuadro, aunque la mano esté quieta.
//
// Un suavizado normal obliga a escoger: o quita el temblor pero el trazo
// se atrasa, o responde rápido pero tiembla. El filtro One Euro
// (Casiez, Roussel y Vogel, 2012) se adapta solo:
//   - mano lenta o quieta -> suaviza MUCHO (adiós temblor)
//   - mano rápida         -> suaviza POCO  (el trazo no se atrasa)
//
// Parámetros:
//   frecuenciaMin: menor = más suave cuando la mano va lenta (quita temblor)
//   beta:          mayor = reacciona más rápido cuando la mano va rápido
// =============================================================

function alfa(frecuenciaCorte, dt) {
  const tau = 1 / (2 * Math.PI * frecuenciaCorte);
  return 1 / (1 + tau / dt);
}

class FiltroOneEuro {
  constructor({ frecuenciaMin = 1.2, beta = 4, frecuenciaDerivada = 1 } = {}) {
    this.frecuenciaMin = frecuenciaMin;
    this.beta = beta;
    this.frecuenciaDerivada = frecuenciaDerivada;
    this.reiniciar();
  }

  reiniciar() { this.x = null; this.dx = 0; this.t = null; }

  // valor: número nuevo; t: tiempo en milisegundos
  filtrar(valor, t) {
    if (this.x === null) { this.x = valor; this.t = t; return valor; }
    const dt = Math.max(1e-3, (t - this.t) / 1000);
    this.t = t;
    // 1. Estimar la velocidad (también suavizada)
    const dxCrudo = (valor - this.x) / dt;
    this.dx += alfa(this.frecuenciaDerivada, dt) * (dxCrudo - this.dx);
    // 2. Más velocidad -> frecuencia de corte más alta -> menos suavizado
    const corte = this.frecuenciaMin + this.beta * Math.abs(this.dx);
    this.x += alfa(corte, dt) * (valor - this.x);
    return this.x;
  }
}

// Filtro para un punto { x, y }. Devuelve una función filtrar(punto, t).
export function crearFiltroPunto(opciones) {
  const fx = new FiltroOneEuro(opciones), fy = new FiltroOneEuro(opciones);
  const filtrar = (p, t = performance.now()) => ({ x: fx.filtrar(p.x, t), y: fy.filtrar(p.y, t) });
  filtrar.reiniciar = () => { fx.reiniciar(); fy.reiniciar(); };
  filtrar.ajustar = (cambios) => { Object.assign(fx, cambios); Object.assign(fy, cambios); };
  return filtrar;
}
