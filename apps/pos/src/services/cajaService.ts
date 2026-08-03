import {
  calcularEsperadoEnCaja,
  calcularVentas,
  TipoMovimientoCaja,
  type ResumenVentas,
} from "@brasas/shared";
import { getLocalDB } from "../db/db.js";
import { diaOperativo } from "./diaOperativo.js";
import type {
  AperturaLocal,
  MovimientoLocal,
  CierreLocal,
  PedidoLocal,
} from "../db/types.js";
import type { EstadoPedido, MetodoPago } from "@brasas/shared";

// Caja del POS (BD-19).
//
// ANTES: todo esto se leía del API (`apiFetch("/caja/estado")`). Es decir, abrir y cerrar
// el día REQUERÍAN INTERNET — contra lo que CONTEXT.md §2.1.1 declara explícitamente, y
// sobre el que es el riesgo técnico #2 del proyecto (la confianza en la conciliación).
//
// AHORA: el estado de caja se calcula desde la base local. Las ventas del día salen de los
// pedidos locales; las entradas y gastos, de los movimientos locales. La sincronización
// con la nube ocurre después, en segundo plano, y no bloquea la operación.
//
// Las fórmulas (esperado en caja, ventas) viven en `@brasas/shared` y las comparte con el
// backend: si cada lado tuviera su copia podrían divergir, y el número que el dueño usa
// para confiar en el sistema sería distinto según quién lo calcule.

export { TipoMovimientoCaja };
export type { ResumenVentas };

// Alias hacia los tipos locales. La interfaz consume la caja LOCAL: los nombres se
// conservan para no reescribir la UI, pero detrás ya no hay una respuesta del API sino
// la base de datos de la terminal.
export type CierreInfo = CierreLocal;
export type MovimientoCaja = MovimientoLocal;

export interface VentasDia {
  fecha: string;
  resumen: ResumenVentas;
  pedidos: PedidoDelDia[];
}

export interface PedidoDelDia {
  id: string;
  folio: number;
  total: number;
  metodoPago: MetodoPago | null;
  estado: EstadoPedido;
  creadoEn: string;
}

export interface TotalesMovimientos {
  entradas: number;
  gastos: number;
}

export interface EstadoCaja {
  fecha: string;
  apertura: AperturaLocal | null;
  cierre: CierreLocal | null;
  ventasDelDia: ResumenVentas | null;
  movimientos: MovimientoLocal[];
  totalesMovimientos: TotalesMovimientos;
  // Efectivo que debe haber en el cajón ahora mismo. null si el día no está abierto.
  esperadoEnCaja: number | null;
}

function totalizar(movimientos: readonly MovimientoLocal[]): TotalesMovimientos {
  return movimientos.reduce<TotalesMovimientos>(
    (acc, m) => {
      if (m.tipo === TipoMovimientoCaja.ENTRADA) acc.entradas += m.monto;
      else acc.gastos += m.monto;
      return acc;
    },
    { entradas: 0, gastos: 0 },
  );
}

function aPedidoDelDia(p: PedidoLocal): PedidoDelDia {
  return {
    id: p.id,
    folio: p.folio,
    total: p.total,
    metodoPago: p.metodoPago ?? null,
    estado: p.estado,
    creadoEn: p.creadoEn,
  };
}

// ---------------------------------------------------------------------------
// Estado del día — se calcula localmente, funciona sin conexión
// ---------------------------------------------------------------------------
export async function getEstadoCaja(fecha = diaOperativo()): Promise<EstadoCaja> {
  const db = await getLocalDB();

  const [apertura, cierre, movimientos, pedidos] = await Promise.all([
    db.getApertura(fecha),
    db.getCierre(fecha),
    db.getMovimientos(fecha),
    db.getPedidosPorDia(fecha),
  ]);

  const totales = totalizar(movimientos);
  const ventasDelDia = apertura ? calcularVentas(pedidos) : null;

  const esperadoEnCaja =
    apertura && ventasDelDia
      ? calcularEsperadoEnCaja(
          apertura.fondoInicial,
          ventasDelDia.ventasEfectivo,
          totales.entradas,
          totales.gastos,
        )
      : null;

  return {
    fecha,
    apertura,
    cierre,
    ventasDelDia,
    movimientos,
    totalesMovimientos: totales,
    esperadoEnCaja,
  };
}

export async function getVentasDia(fecha = diaOperativo()): Promise<VentasDia> {
  const db = await getLocalDB();
  const pedidos = await db.getPedidosPorDia(fecha);

  return {
    fecha,
    resumen: calcularVentas(pedidos),
    pedidos: pedidos.map(aPedidoDelDia),
  };
}

// ---------------------------------------------------------------------------
// Operaciones — se escriben en local y se encolan para sincronizar
// ---------------------------------------------------------------------------

// RN-24: hay al menos un día anterior con apertura y sin cierre. No es un fallo técnico
// sino una condición de la operación, y la interfaz necesita saber QUÉ días son para
// ofrecer cerrarlos — de ahí el tipo propio en vez de un Error suelto.
export class DiasSinCerrarError extends Error {
  readonly fechas: string[];

  constructor(fechas: string[]) {
    const lista = fechas.join(", ");
    super(
      fechas.length === 1
        ? `El turno del ${lista} quedó sin cerrar. Ciérralo antes de abrir uno nuevo.`
        : `Hay turnos sin cerrar (${lista}). Ciérralos antes de abrir uno nuevo.`,
    );
    this.name = "DiasSinCerrarError";
    this.fechas = fechas;
  }
}

// Días con apertura y sin cierre anteriores a `fecha`. La interfaz los usa para avisar y
// para ofrecer el cierre pendiente; `abrirDia` los usa para bloquear.
export async function getDiasSinCerrar(fecha = diaOperativo()): Promise<AperturaLocal[]> {
  const db = await getLocalDB();
  return db.getDiasSinCerrar(fecha);
}

export async function abrirDia(
  id: string,
  fondoInicial: number,
  notas?: string,
): Promise<void> {
  const db = await getLocalDB();
  const fecha = diaOperativo();

  // RN-08: una sola apertura por día.
  if (await db.getApertura(fecha)) {
    throw new Error("El día ya está abierto");
  }

  // RN-24: no se abre un día nuevo arrastrando uno anterior sin cerrar. No hay cierre
  // automático a propósito: cerrar solo un día que nadie contó produce un corte sin
  // validar con apariencia de bueno. Ver CONTEXT.md §7.7.
  //
  // El candado vive aquí, en la terminal, y NO en el servidor. El servidor no puede
  // aplicarlo: la cola de sync manda todas las aperturas antes que los cierres (RN-19),
  // así que la apertura de hoy llega a la nube antes que el cierre de ayer y la rechazaría
  // en falso, atascando la cola. La integridad de los datos ya la garantiza RN-08 con su
  // índice único; esto de aquí es un candado sobre el flujo de trabajo del encargado.
  const pendientes = await db.getDiasSinCerrar(fecha);
  if (pendientes.length > 0) {
    throw new DiasSinCerrarError(pendientes.map((a) => a.fechaOperativa));
  }

  await db.guardarApertura({
    id,
    fechaOperativa: fecha,
    fondoInicial,
    ...(notas !== undefined && { notas }),
    abiertoEn: new Date().toISOString(),
    sincronizado: false,
  });
}

export async function registrarMovimiento(
  id: string,
  tipo: TipoMovimientoCaja,
  concepto: string,
  monto: number,
): Promise<MovimientoLocal> {
  const db = await getLocalDB();
  const fecha = diaOperativo();

  const [apertura, cierre] = await Promise.all([db.getApertura(fecha), db.getCierre(fecha)]);

  // RN-14: solo se aceptan movimientos con el día abierto y sin cerrar.
  if (!apertura) throw new Error("No hay apertura de caja para hoy");
  if (cierre) throw new Error("El día ya está cerrado");

  const movimiento: MovimientoLocal = {
    id,
    fechaOperativa: fecha,
    tipo,
    concepto,
    monto,
    creadoEn: new Date().toISOString(),
    sincronizado: false,
    eliminado: false,
  };

  await db.guardarMovimiento(movimiento);
  return movimiento;
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const db = await getLocalDB();
  await db.marcarMovimientoEliminado(id);
}

// Cierra el día con los números que la terminal ve AHORA. Ese es el cálculo que se imprime
// en el ticket de corte y que el encargado firma, así que se guarda como snapshot: debe
// poder reproducirse tal cual, aunque después algo cambie en la nube.
//
// El conteo físico del efectivo y su diferencia NO se registran: se hacen fuera del
// sistema. El cierre solo deja el esperado en caja como referencia.
//
// `fecha` es explícita porque el cierre ya no es forzosamente el del día en curso: un
// turno que quedó abierto ayer se cierra desde la terminal de hoy (RN-24). Antes esto
// estaba fijo en `diaOperativo()` y por eso un día sin cerrar era irrecuperable.
export async function cerrarDia(
  id: string,
  fecha = diaOperativo(),
  notas?: string,
): Promise<CierreLocal> {
  const db = await getLocalDB();

  const estado = await getEstadoCaja(fecha);

  if (!estado.apertura) throw new Error(`No hay apertura de caja para el ${fecha}`);
  if (estado.cierre) throw new Error("El día ya está cerrado");

  const ventas = estado.ventasDelDia!;
  const esperadoEnCaja = estado.esperadoEnCaja!;

  const linea = (m: MovimientoLocal) => ({ id: m.id, concepto: m.concepto, monto: m.monto });

  const cierre: CierreLocal = {
    id,
    fechaOperativa: fecha,
    fondoInicial: estado.apertura.fondoInicial,
    entradas: estado.movimientos
      .filter((m) => m.tipo === TipoMovimientoCaja.ENTRADA)
      .map(linea),
    gastos: estado.movimientos
      .filter((m) => m.tipo === TipoMovimientoCaja.GASTO)
      .map(linea),
    ventasEfectivo: ventas.ventasEfectivo,
    ventasTarjeta: ventas.ventasTarjeta,
    ventasTransfer: ventas.ventasTransfer,
    totalVentas: ventas.totalVentas,
    reembolsosEfectivo: ventas.reembolsosEfectivo,
    totalEntradas: estado.totalesMovimientos.entradas,
    totalGastos: estado.totalesMovimientos.gastos,
    esperadoEnCaja,
    ...(notas !== undefined && { notas }),
    cerradoEn: new Date().toISOString(),
    sincronizado: false,
  };

  await db.guardarCierre(cierre);
  return cierre;
}
