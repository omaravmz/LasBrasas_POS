import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import type { EstadoPedido, MetodoPago, TipoMovimientoCaja } from "@prisma/client";

// Mazatlan = UTC-7 (sin DST desde 2023)
function fechaMazatlanHoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mazatlan" }).format(new Date());
}

// Convierte "YYYY-MM-DD" local a rango UTC para filtrar pedidos.
// 00:00 Mazatlan (UTC-7) = 07:00 UTC
function rangoDiaUTC(fechaStr: string): { inicio: Date; fin: Date } {
  const inicio = new Date(`${fechaStr}T07:00:00.000Z`);
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio, fin };
}

// Fecha como objeto Date con la parte de fecha correcta para @db.Date de Prisma
function fechaDate(fechaStr: string): Date {
  return new Date(`${fechaStr}T00:00:00.000Z`);
}

// ---------------------------------------------------------------------------
// Tipos de retorno

export interface ResumenVentas {
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  reembolsosEfectivo: number;
  numPedidos: number;
}

export interface PedidoDelDia {
  id: string;
  folio: number;
  total: number;
  metodoPago: MetodoPago | null;
  estado: EstadoPedido;
  creadoEn: string;
}

export interface MovimientoCajaInfo {
  id: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
  creadoEn: string;
}

export interface TotalesMovimientos {
  entradas: number;
  gastos: number;
}

export interface CierreInfo {
  id: string;
  fondoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  reembolsosEfectivo: number;
  totalEntradas: number;
  totalGastos: number;
  esperadoEnCaja: number;
  conteoFisico: number;
  diferencia: number;
  gastos: { id: string; concepto: string; monto: number }[];
  entradas: { id: string; concepto: string; monto: number }[];
  notas: string | null;
  cerradoEn: string;
}

export interface EstadoCaja {
  fecha: string;
  apertura: { id: string; fondoInicial: number; notas: string | null; abiertoEn: string } | null;
  cierre: CierreInfo | null;
  ventasDelDia: ResumenVentas | null;
  movimientos: MovimientoCajaInfo[];
  totalesMovimientos: TotalesMovimientos;
  // Efectivo que debe haber en el cajón ahora mismo. null si el día no está abierto.
  esperadoEnCaja: number | null;
}

// ---------------------------------------------------------------------------
// Conciliación de efectivo
//
// Esperado = fondo inicial + ventas en efectivo + entradas - gastos
//
// Los reembolsos NO se restan aquí a propósito: un pedido cancelado ya queda
// excluido de `ventasEfectivo` (calcularVentasDia filtra CANCELADO), así que
// restar además su reembolso descontaría el mismo dinero dos veces. Ejemplo:
// fondo $500, venta de $100 en efectivo que luego se cancela y se devuelve.
// El cajón vuelve a $500; con la venta ya excluida, esperado = $500. Correcto.
// `reembolsosEfectivo` se conserva solo como dato informativo del reporte.
export function calcularEsperadoEnCaja(
  fondoInicial: number,
  ventasEfectivo: number,
  entradas: number,
  gastos: number,
): number {
  return fondoInicial + ventasEfectivo + entradas - gastos;
}

export function totalizarMovimientos(movimientos: MovimientoCajaInfo[]): TotalesMovimientos {
  return movimientos.reduce<TotalesMovimientos>(
    (acc, m) => {
      if (m.tipo === "ENTRADA") acc.entradas += m.monto;
      else acc.gastos += m.monto;
      return acc;
    },
    { entradas: 0, gastos: 0 },
  );
}

// ---------------------------------------------------------------------------
// Cálculo de ventas del día

export async function calcularVentasDia(
  sucursalId: string,
  fecha: string,
): Promise<ResumenVentas> {
  const { inicio, fin } = rangoDiaUTC(fecha);
  const base = { sucursalId, creadoEn: { gte: inicio, lt: fin } };

  const [efectivo, tarjeta, transfer, reembolsos, numPedidos] = await Promise.all([
    prisma.pedido.aggregate({
      where: { ...base, estado: { not: "CANCELADO" }, metodoPago: "EFECTIVO" },
      _sum: { total: true },
    }),
    prisma.pedido.aggregate({
      where: { ...base, estado: { not: "CANCELADO" }, metodoPago: "TARJETA" },
      _sum: { total: true },
    }),
    prisma.pedido.aggregate({
      where: { ...base, estado: { not: "CANCELADO" }, metodoPago: "TRANSFERENCIA" },
      _sum: { total: true },
    }),
    prisma.pedido.aggregate({
      where: { ...base, reembolsado: true, metodoPago: "EFECTIVO" },
      _sum: { montoReembolso: true },
    }),
    prisma.pedido.count({
      where: { ...base, estado: { not: "CANCELADO" } },
    }),
  ]);

  const ventasEfectivo = efectivo._sum.total?.toNumber() ?? 0;
  const ventasTarjeta = tarjeta._sum.total?.toNumber() ?? 0;
  const ventasTransfer = transfer._sum.total?.toNumber() ?? 0;
  const reembolsosEfectivo = reembolsos._sum.montoReembolso?.toNumber() ?? 0;

  return {
    ventasEfectivo,
    ventasTarjeta,
    ventasTransfer,
    totalVentas: ventasEfectivo + ventasTarjeta + ventasTransfer,
    reembolsosEfectivo,
    numPedidos,
  };
}

// Lista completa de pedidos del día, incluidos los cancelados (se muestran en $0).
export async function listarPedidosDia(
  sucursalId: string,
  fecha: string,
): Promise<PedidoDelDia[]> {
  const { inicio, fin } = rangoDiaUTC(fecha);

  const pedidos = await prisma.pedido.findMany({
    where: { sucursalId, creadoEn: { gte: inicio, lt: fin } },
    select: {
      id: true,
      folio: true,
      total: true,
      metodoPago: true,
      estado: true,
      creadoEn: true,
    },
    orderBy: { folio: "asc" },
  });

  return pedidos.map((p) => ({
    id: p.id,
    folio: p.folio,
    total: p.total.toNumber(),
    metodoPago: p.metodoPago,
    estado: p.estado,
    creadoEn: p.creadoEn.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Movimientos de caja (entradas y retiros durante el día)

export async function listarMovimientos(
  sucursalId: string,
  fecha: string,
): Promise<MovimientoCajaInfo[]> {
  const movimientos = await prisma.movimientoCaja.findMany({
    where: { sucursalId, fecha: fechaDate(fecha) },
    orderBy: { creadoEn: "asc" },
  });

  return movimientos.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    concepto: m.concepto,
    monto: m.monto.toNumber(),
    creadoEn: m.creadoEn.toISOString(),
  }));
}

export interface RegistrarMovimientoInput {
  id: string;
  sucursalId: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
}

export async function registrarMovimiento(
  input: RegistrarMovimientoInput,
): Promise<MovimientoCajaInfo> {
  const fecha = fechaMazatlanHoy();
  const fd = fechaDate(fecha);

  await asegurarDiaAbierto(input.sucursalId, fd);

  // Idempotente: reenviar el mismo UUID (sync offline) no duplica el movimiento.
  const existente = await prisma.movimientoCaja.findUnique({ where: { id: input.id } });
  if (existente) {
    return {
      id: existente.id,
      tipo: existente.tipo,
      concepto: existente.concepto,
      monto: existente.monto.toNumber(),
      creadoEn: existente.creadoEn.toISOString(),
    };
  }

  const movimiento = await prisma.movimientoCaja.create({
    data: {
      id: input.id,
      sucursalId: input.sucursalId,
      fecha: fd,
      tipo: input.tipo,
      concepto: input.concepto,
      monto: input.monto,
    },
  });

  return {
    id: movimiento.id,
    tipo: movimiento.tipo,
    concepto: movimiento.concepto,
    monto: movimiento.monto.toNumber(),
    creadoEn: movimiento.creadoEn.toISOString(),
  };
}

export async function eliminarMovimiento(id: string, sucursalId: string): Promise<void> {
  const movimiento = await prisma.movimientoCaja.findUnique({
    where: { id },
    select: { id: true, sucursalId: true, fecha: true },
  });

  if (!movimiento) {
    throw new AppError("NOT_FOUND", "Movimiento no encontrado", 404);
  }
  if (movimiento.sucursalId !== sucursalId) {
    throw new AppError("FORBIDDEN", "El movimiento no pertenece a esta sucursal", 403);
  }

  await asegurarDiaAbierto(sucursalId, movimiento.fecha);

  await prisma.movimientoCaja.delete({ where: { id } });
}

// El día debe estar abierto y sin cerrar para aceptar movimientos.
async function asegurarDiaAbierto(sucursalId: string, fecha: Date): Promise<void> {
  const [apertura, cierre] = await Promise.all([
    prisma.aperturaDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha } },
      select: { id: true },
    }),
    prisma.cierreDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha } },
      select: { id: true },
    }),
  ]);

  if (!apertura) {
    throw new AppError("PRECONDITION_FAILED", "No existe apertura para este día", 422);
  }
  if (cierre) {
    throw new AppError("CONFLICT", "El día ya está cerrado", 409);
  }
}

// ---------------------------------------------------------------------------
// Estado del día (apertura, cierre, ventas, movimientos)

export async function estadoCaja(sucursalId: string): Promise<EstadoCaja> {
  const fecha = fechaMazatlanHoy();
  const fd = fechaDate(fecha);

  const [apertura, cierreRow, movimientos] = await Promise.all([
    prisma.aperturaDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha: fd } },
    }),
    prisma.cierreDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha: fd } },
      include: {
        gastos: { orderBy: { creadoEn: "asc" } },
        entradas: { orderBy: { creadoEn: "asc" } },
      },
    }),
    listarMovimientos(sucursalId, fecha),
  ]);

  const totales = totalizarMovimientos(movimientos);

  const ventasDelDia =
    apertura && !cierreRow ? await calcularVentasDia(sucursalId, fecha) : null;

  const esperadoEnCaja =
    apertura && ventasDelDia
      ? calcularEsperadoEnCaja(
          apertura.fondoInicial.toNumber(),
          ventasDelDia.ventasEfectivo,
          totales.entradas,
          totales.gastos,
        )
      : null;

  return {
    fecha,
    apertura: apertura
      ? {
          id: apertura.id,
          fondoInicial: apertura.fondoInicial.toNumber(),
          notas: apertura.notas,
          abiertoEn: apertura.abiertoEn.toISOString(),
        }
      : null,
    cierre: cierreRow ? mapearCierre(cierreRow) : null,
    ventasDelDia,
    movimientos,
    totalesMovimientos: totales,
    esperadoEnCaja,
  };
}

// ---------------------------------------------------------------------------
// Apertura

export interface AbrirDiaInput {
  id: string;
  sucursalId: string;
  fondoInicial: number;
  notas?: string;
}

export async function abrirDia(input: AbrirDiaInput): Promise<void> {
  const fecha = fechaMazatlanHoy();
  const fd = fechaDate(fecha);

  const existe = await prisma.aperturaDia.findUnique({
    where: { sucursalId_fecha: { sucursalId: input.sucursalId, fecha: fd } },
    select: { id: true },
  });
  if (existe) {
    throw new AppError("CONFLICT", "Ya existe una apertura para hoy", 409);
  }

  await prisma.aperturaDia.create({
    data: {
      id: input.id,
      sucursalId: input.sucursalId,
      fecha: fd,
      fondoInicial: input.fondoInicial,
      ...(input.notas !== undefined && { notas: input.notas }),
    },
  });
}

// ---------------------------------------------------------------------------
// Cierre

export interface CerrarDiaInput {
  id: string;
  sucursalId: string;
  conteoFisico: number;
  notas?: string;
}

interface CierreRow {
  id: string;
  fondoInicial: { toNumber(): number };
  ventasEfectivo: { toNumber(): number };
  ventasTarjeta: { toNumber(): number };
  ventasTransfer: { toNumber(): number };
  totalVentas: { toNumber(): number };
  reembolsosEfectivo: { toNumber(): number };
  conteoFisico: { toNumber(): number };
  diferencia: { toNumber(): number };
  notas: string | null;
  cerradoEn: Date;
  gastos: { id: string; concepto: string; monto: { toNumber(): number } }[];
  entradas: { id: string; concepto: string; monto: { toNumber(): number } }[];
}

function mapearCierre(cierre: CierreRow): CierreInfo {
  const gastos = cierre.gastos.map((g) => ({
    id: g.id,
    concepto: g.concepto,
    monto: g.monto.toNumber(),
  }));
  const entradas = cierre.entradas.map((e) => ({
    id: e.id,
    concepto: e.concepto,
    monto: e.monto.toNumber(),
  }));

  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const totalEntradas = entradas.reduce((s, e) => s + e.monto, 0);
  const fondoInicial = cierre.fondoInicial.toNumber();
  const ventasEfectivo = cierre.ventasEfectivo.toNumber();

  return {
    id: cierre.id,
    fondoInicial,
    ventasEfectivo,
    ventasTarjeta: cierre.ventasTarjeta.toNumber(),
    ventasTransfer: cierre.ventasTransfer.toNumber(),
    totalVentas: cierre.totalVentas.toNumber(),
    reembolsosEfectivo: cierre.reembolsosEfectivo.toNumber(),
    totalEntradas,
    totalGastos,
    esperadoEnCaja: calcularEsperadoEnCaja(
      fondoInicial,
      ventasEfectivo,
      totalEntradas,
      totalGastos,
    ),
    conteoFisico: cierre.conteoFisico.toNumber(),
    diferencia: cierre.diferencia.toNumber(),
    gastos,
    entradas,
    notas: cierre.notas,
    cerradoEn: cierre.cerradoEn.toISOString(),
  };
}

export async function cerrarDia(input: CerrarDiaInput): Promise<CierreInfo> {
  const fecha = fechaMazatlanHoy();
  const fd = fechaDate(fecha);

  const apertura = await prisma.aperturaDia.findUnique({
    where: { sucursalId_fecha: { sucursalId: input.sucursalId, fecha: fd } },
    select: { fondoInicial: true },
  });
  if (!apertura) {
    throw new AppError("PRECONDITION_FAILED", "No existe apertura para hoy", 422);
  }

  const cierreExiste = await prisma.cierreDia.findUnique({
    where: { sucursalId_fecha: { sucursalId: input.sucursalId, fecha: fd } },
    select: { id: true },
  });
  if (cierreExiste) {
    throw new AppError("CONFLICT", "Ya existe un cierre para hoy", 409);
  }

  const [ventas, movimientos] = await Promise.all([
    calcularVentasDia(input.sucursalId, fecha),
    listarMovimientos(input.sucursalId, fecha),
  ]);

  const totales = totalizarMovimientos(movimientos);
  const fondoInicial = apertura.fondoInicial.toNumber();

  const esperadoEnCaja = calcularEsperadoEnCaja(
    fondoInicial,
    ventas.ventasEfectivo,
    totales.entradas,
    totales.gastos,
  );
  const diferencia = input.conteoFisico - esperadoEnCaja;

  // Los movimientos del día se copian a GastoDia/EntradaDia: el cierre queda
  // como snapshot inmutable, independiente de la bitácora de movimientos.
  const cierre = await prisma.cierreDia.create({
    data: {
      id: input.id,
      sucursalId: input.sucursalId,
      fecha: fd,
      fondoInicial,
      ventasEfectivo: ventas.ventasEfectivo,
      ventasTarjeta: ventas.ventasTarjeta,
      ventasTransfer: ventas.ventasTransfer,
      totalVentas: ventas.totalVentas,
      reembolsosEfectivo: ventas.reembolsosEfectivo,
      conteoFisico: input.conteoFisico,
      diferencia,
      ...(input.notas !== undefined && { notas: input.notas }),
      gastos: {
        create: movimientos
          .filter((m) => m.tipo === "GASTO")
          .map((m) => ({ id: m.id, concepto: m.concepto, monto: m.monto })),
      },
      entradas: {
        create: movimientos
          .filter((m) => m.tipo === "ENTRADA")
          .map((m) => ({ id: m.id, concepto: m.concepto, monto: m.monto })),
      },
    },
    include: { gastos: true, entradas: true },
  });

  return mapearCierre(cierre);
}
