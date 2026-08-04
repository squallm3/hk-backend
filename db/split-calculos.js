/**
 * Logica de calculo del modulo SPLIT.
 *
 * Todo el modulo trabaja internamente en CENTAVOS ENTEROS.
 * En la base los montos se guardan como decimal(12,2) para
 * mantener la convencion del resto del esquema, pero cualquier
 * operacion de division se hace en enteros: si se dividiera en
 * punto flotante, repartir 100 entre 3 pierde un centavo y los
 * saldos del grupo nunca cierran en cero.
 *
 * Este archivo no toca la base de datos ni depende de Express,
 * asi que se puede testear solo.
 */

/** decimal de MySQL (llega como string) -> centavos enteros */
function aCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

/** centavos enteros -> string decimal listo para guardar */
function aDecimal(centavos) {
  return (centavos / 100).toFixed(2);
}

/**
 * Reparte un total entre varios pesos manteniendo la suma exacta.
 * Los centavos sobrantes se asignan a quienes tenian la fraccion
 * mas alta, que es el criterio que menos distorsiona el reparto.
 */
function repartir(total, pesos) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma <= 0) return pesos.map(() => 0);

  const exactos = pesos.map((p) => (total * p) / suma);
  const base = exactos.map((n) => Math.floor(n));
  const sobrante = total - base.reduce((a, b) => a + b, 0);

  const orden = exactos
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < sobrante; k++) base[orden[k % orden.length].i] += 1;
  return base;
}

/**
 * Calcula cuanto le toca a cada miembro segun el tipo de reparto.
 *
 * @param {string} tipo      igual | monto | porcentaje | partes
 * @param {number} total     monto del gasto en centavos
 * @param {number[]} miembroIds  ids de los miembros que participan
 * @param {object} valores   { miembroId: valor } — no se usa en 'igual'
 * @returns {{ partes?: object, error?: string }}
 */
function calcularPartes(tipo, total, miembroIds, valores = {}) {
  if (!Array.isArray(miembroIds) || miembroIds.length === 0) {
    return { error: 'El gasto necesita al menos un participante' };
  }
  if (!Number.isInteger(total) || total <= 0) {
    return { error: 'El monto tiene que ser mayor a cero' };
  }

  const armar = (montos) =>
    Object.fromEntries(miembroIds.map((id, i) => [id, montos[i]]));

  if (tipo === 'igual') {
    return { partes: armar(repartir(total, miembroIds.map(() => 1))) };
  }

  if (tipo === 'monto') {
    const montos = miembroIds.map((id) => aCentavos(valores[id] || 0));
    if (montos.some((m) => m < 0)) {
      return { error: 'Los montos no pueden ser negativos' };
    }
    const suma = montos.reduce((a, b) => a + b, 0);
    if (suma !== total) {
      const dif = aDecimal(Math.abs(suma - total));
      return {
        error:
          suma < total
            ? `Faltan ${dif} por asignar`
            : `Los montos asignados superan el total por ${dif}`,
      };
    }
    return { partes: armar(montos) };
  }

  if (tipo === 'porcentaje') {
    const pcts = miembroIds.map((id) => Number(valores[id] || 0));
    if (pcts.some((p) => p < 0 || Number.isNaN(p))) {
      return { error: 'Porcentaje invalido' };
    }
    const suma = Math.round(pcts.reduce((a, b) => a + b, 0) * 100) / 100;
    if (suma !== 100) {
      return { error: `Los porcentajes suman ${suma}% y tienen que sumar 100%` };
    }
    return { partes: armar(repartir(total, pcts)) };
  }

  if (tipo === 'partes') {
    const partes = miembroIds.map((id) => Number(valores[id] || 0));
    if (partes.some((p) => p < 0 || Number.isNaN(p))) {
      return { error: 'Cantidad de partes invalida' };
    }
    if (partes.reduce((a, b) => a + b, 0) <= 0) {
      return { error: 'Hay que asignar al menos una parte' };
    }
    return { partes: armar(repartir(total, partes)) };
  }

  return { error: `Tipo de reparto desconocido: ${tipo}` };
}

/**
 * Saldo neto de cada miembro, en centavos.
 *   positivo = le deben
 *   negativo = debe
 * La suma de todos los saldos siempre da cero.
 */
function calcularSaldos(miembroIds, gastos, pagos) {
  const saldos = Object.fromEntries(miembroIds.map((id) => [id, 0]));

  for (const gasto of gastos) {
    if (saldos[gasto.pagadoPorId] !== undefined) {
      saldos[gasto.pagadoPorId] += gasto.montoCentavos;
    }
    for (const parte of gasto.partes) {
      if (saldos[parte.miembroId] !== undefined) {
        saldos[parte.miembroId] -= parte.montoCentavos;
      }
    }
  }

  for (const pago of pagos) {
    if (saldos[pago.deMiembroId] !== undefined) {
      saldos[pago.deMiembroId] += pago.montoCentavos;
    }
    if (saldos[pago.aMiembroId] !== undefined) {
      saldos[pago.aMiembroId] -= pago.montoCentavos;
    }
  }

  return saldos;
}

/**
 * Reduce los saldos a la menor cantidad posible de transferencias.
 * Empareja al que mas debe con al que mas le deben, hasta cerrar.
 */
function simplificarDeudas(saldos) {
  const deben = [];
  const lesDeben = [];

  for (const [id, saldo] of Object.entries(saldos)) {
    if (saldo < 0) deben.push({ id: Number(id), monto: -saldo });
    else if (saldo > 0) lesDeben.push({ id: Number(id), monto: saldo });
  }

  deben.sort((a, b) => b.monto - a.monto);
  lesDeben.sort((a, b) => b.monto - a.monto);

  const transferencias = [];
  let i = 0;
  let j = 0;

  while (i < deben.length && j < lesDeben.length) {
    const monto = Math.min(deben[i].monto, lesDeben[j].monto);
    if (monto > 0) {
      transferencias.push({
        deMiembroId: deben[i].id,
        aMiembroId: lesDeben[j].id,
        montoCentavos: monto,
        monto: aDecimal(monto),
      });
    }
    deben[i].monto -= monto;
    lesDeben[j].monto -= monto;
    if (deben[i].monto === 0) i++;
    if (lesDeben[j].monto === 0) j++;
  }

  return transferencias;
}

module.exports = {
  aCentavos,
  aDecimal,
  repartir,
  calcularPartes,
  calcularSaldos,
  simplificarDeudas,
};
