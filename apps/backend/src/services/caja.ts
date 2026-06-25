import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";

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

export interface EstadoCaja {
  fecha: string;
  apertura: { id: string; fondoInicial: number; notas: string | null; abiertoEn: string } | null;
  cierre: {
    id: string;
    fondoInicial: number;
    ventasEfectivo: number;
    ventasTarjeta: number;
    ventasTransfer: number;
    totalVentas: number;
    reembolsosEfectivo: number;
    conteoFisico: number;
    diferencia: number;
    gastos: { id: string; concepto: string; monto: number }[];
    notas: string | null;
    cerradoEn: string;
  } | null;
  ventasDelDia: ResumenVentas | null;
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

// ---------------------------------------------------------------------------
// Estado del día (apertura, cierre, ventas)

export async function estadoCaja(sucursalId: string): Promise<EstadoCaja> {
  const fecha = fechaMazatlanHoy();
  const fd = fechaDate(fecha);

  const [apertura, cierre] = await Promise.all([
    prisma.aperturaDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha: fd } },
    }),
    prisma.cierreDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha: fd } },
      include: { gastos: { orderBy: { creadoEn: "asc" } } },
    }),
  ]);

  const ventasDelDia =
    apertura && !cierre ? await calcularVentasDia(sucursalId, fecha) : null;

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
    cierre: cierre
      ? {
          id: cierre.id,
          fondoInicial: cierre.fondoInicial.toNumber(),
          ventasEfectivo: cierre.ventasEfectivo.toNumber(),
          ventasTarjeta: cierre.ventasTarjeta.toNumber(),
          ventasTransfer: cierre.ventasTransfer.toNumber(),
          totalVentas: cierre.totalVentas.toNumber(),
          reembolsosEfectivo: cierre.reembolsosEfectivo.toNumber(),
          conteoFisico: cierre.conteoFisico.toNumber(),
          diferencia: cierre.diferencia.toNumber(),
          gastos: cierre.gastos.map((g) => ({
            id: g.id,
            concepto: g.concepto,
            monto: g.monto.toNumber(),
          })),
          notas: cierre.notas,
          cerradoEn: cierre.cerradoEn.toISOString(),
        }
      : null,
    ventasDelDia,
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

export interface GastoInput {
  id: string;
  concepto: string;
  monto: number;
}

export interface CerrarDiaInput {
  id: string;
  sucursalId: string;
  conteoFisico: number;
  notas?: string;
  gastos: GastoInput[];
}

export async function cerrarDia(input: CerrarDiaInput): Promise<EstadoCaja["cierre"]> {
  const fecha = fechaMazatlanHoy();
  const fd = fechaDate(fecha);

  // Validar que existe apertura
  const apertura = await prisma.aperturaDia.findUnique({
    where: { sucursalId_fecha: { sucursalId: input.sucursalId, fecha: fd } },
    select: { fondoInicial: true },
  });
  if (!apertura) {
    throw new AppError("PRECONDITION_FAILED", "No existe apertura para hoy", 422);
  }

  // Validar que no haya cierre ya
  const cierreExiste = await prisma.cierreDia.findUnique({
    where: { sucursalId_fecha: { sucursalId: input.sucursalId, fecha: fd } },
    select: { id: true },
  });
  if (cierreExiste) {
    throw new AppError("CONFLICT", "Ya existe un cierre para hoy", 409);
  }

  const ventas = await calcularVentasDia(input.sucursalId, fecha);
  const fondoInicial = apertura.fondoInicial.toNumber();

  // diferencia = conteoFisico - (fondoInicial + ventasEfectivo - reembolsosEfectivo)
  const efectivoEsperado = fondoInicial + ventas.ventasEfectivo - ventas.reembolsosEfectivo;
  const diferencia = input.conteoFisico - efectivoEsperado;

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
        create: input.gastos.map((g) => ({
          id: g.id,
          concepto: g.concepto,
          monto: g.monto,
        })),
      },
    },
    include: { gastos: true },
  });

  return {
    id: cierre.id,
    fondoInicial: cierre.fondoInicial.toNumber(),
    ventasEfectivo: cierre.ventasEfectivo.toNumber(),
    ventasTarjeta: cierre.ventasTarjeta.toNumber(),
    ventasTransfer: cierre.ventasTransfer.toNumber(),
    totalVentas: cierre.totalVentas.toNumber(),
    reembolsosEfectivo: cierre.reembolsosEfectivo.toNumber(),
    conteoFisico: cierre.conteoFisico.toNumber(),
    diferencia: cierre.diferencia.toNumber(),
    gastos: cierre.gastos.map((g) => ({
      id: g.id,
      concepto: g.concepto,
      monto: g.monto.toNumber(),
    })),
    notas: cierre.notas,
    cerradoEn: cierre.cerradoEn.toISOString(),
  };
}
