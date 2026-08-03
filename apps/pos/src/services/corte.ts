import { getEstadoCaja, getVentasDia } from "./cajaService.js";
import { diaOperativo } from "./diaOperativo.js";
import { dispararImpresionCierre, type DatosCierreImpresion } from "./print.js";
import type { MetodoPago } from "@brasas/shared";

// Generación de corte (RN-23, CONTEXT.md §7.7.1).
//
// Un corte es una operación de SOLO LECTURA. No escribe, no sella, no cierra el día. Se
// puede emitir cuantas veces haga falta y para cualquier fecha operativa.
//
// Existe porque en la operación real se cuenta el dinero y la carne varias veces por
// jornada, no solo al final. Antes la única forma de obtener un corte era cerrar el día:
// para sacar un conteo de control había que terminar el turno, que es justo lo que no se
// quiere a media tarde.
//
// El cierre (`cajaService.cerrarDia`) usa esta misma función para su ticket. Un solo
// cálculo, un solo formato: si el corte de las 5pm y el del cierre pudieran diferir,
// ninguno de los dos serviría para confiar en la caja.

export class SinAperturaError extends Error {
  constructor(fecha: string) {
    super(`El ${fecha} no tuvo apertura de caja: no hay corte que generar.`);
    this.name = "SinAperturaError";
  }
}

/**
 * Arma los datos del corte de una fecha operativa. No modifica nada.
 *
 * Si el día ya está cerrado se reproduce el snapshot congelado del cierre —el ticket que
 * el encargado tiene en la mano debe poder reimprimirse idéntico, aunque después haya
 * llegado un pedido rezagado. Si sigue abierto, se calcula en vivo y el ticket sale
 * marcado como parcial.
 */
export async function armarCorte(
  sucursalNombre: string,
  fecha = diaOperativo(),
): Promise<DatosCierreImpresion> {
  const [estado, ventasDia] = await Promise.all([
    getEstadoCaja(fecha),
    getVentasDia(fecha),
  ]);

  if (!estado.apertura) throw new SinAperturaError(fecha);

  const pedidos = ventasDia.pedidos.map((p) => ({
    folio: p.folio,
    total: p.total,
    metodoPago: p.metodoPago as MetodoPago | null,
    cancelado: p.estado === "CANCELADO",
  }));

  // Día cerrado: el snapshot manda sobre el cálculo en vivo.
  const cierre = estado.cierre;
  if (cierre) {
    const datos: DatosCierreImpresion = {
      sucursal: sucursalNombre,
      fecha,
      cerradoEn: cierre.cerradoEn,
      fondoInicial: cierre.fondoInicial,
      ventasEfectivo: cierre.ventasEfectivo,
      ventasTarjeta: cierre.ventasTarjeta,
      ventasTransfer: cierre.ventasTransfer,
      totalVentas: cierre.totalVentas,
      numPedidos: ventasDia.resumen.numPedidos,
      pedidos,
      entradas: cierre.entradas.map((e) => ({ concepto: e.concepto, monto: e.monto })),
      gastos: cierre.gastos.map((g) => ({ concepto: g.concepto, monto: g.monto })),
      reembolsosEfectivo: cierre.reembolsosEfectivo,
      esperadoEnCaja: cierre.esperadoEnCaja,
    };
    if (cierre.notas !== undefined) datos.notas = cierre.notas;
    return datos;
  }

  // Día abierto: corte de control. Los números son los de este instante y pueden cambiar.
  const ventas = estado.ventasDelDia!;

  return {
    sucursal: sucursalNombre,
    fecha,
    cerradoEn: new Date().toISOString(),
    parcial: true,
    fondoInicial: estado.apertura.fondoInicial,
    ventasEfectivo: ventas.ventasEfectivo,
    ventasTarjeta: ventas.ventasTarjeta,
    ventasTransfer: ventas.ventasTransfer,
    totalVentas: ventas.totalVentas,
    numPedidos: ventas.numPedidos,
    pedidos,
    entradas: estado.movimientos
      .filter((m) => m.tipo === "ENTRADA")
      .map((m) => ({ concepto: m.concepto, monto: m.monto })),
    gastos: estado.movimientos
      .filter((m) => m.tipo === "GASTO")
      .map((m) => ({ concepto: m.concepto, monto: m.monto })),
    reembolsosEfectivo: ventas.reembolsosEfectivo,
    esperadoEnCaja: estado.esperadoEnCaja!,
  };
}

/** Arma el corte y lo manda a la impresora. Sigue sin escribir nada en la base. */
export async function imprimirCorte(
  sucursalNombre: string,
  fecha = diaOperativo(),
): Promise<DatosCierreImpresion> {
  const datos = await armarCorte(sucursalNombre, fecha);
  await dispararImpresionCierre(datos);
  return datos;
}
