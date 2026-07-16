import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { calcularEsperadoEnCaja, calcularDiferencia } from "@brasas/shared";
import type { EstadoPedido, MetodoPago, TipoMovimientoCaja } from "@prisma/client";

// El día de operación ya NO se deriva del reloj ni del timestamp de los pedidos.
//
// Antes, `rangoDiaUTC()` reconstruía la jornada restando 7 horas a mano a `creadoEn`.
// Eso atribuía cada venta al día en que se CREÓ el registro, no al día de caja en que
// realmente se hizo: un pedido sincronizado a las 00:30 caía en el día siguiente y
// descuadraba dos cortes. Ahora todo se filtra por `Pedido.fechaOperativa`, que estampa
// la terminal en el momento del cobro. Ver BD-02.
//
// La fecha viaja siempre desde la terminal, también en apertura, movimientos y cierre:
// una operación de caja hecha offline pertenece a SU jornada, no a la del momento en que
// logró sincronizar.

// Fecha como objeto Date con la parte de fecha correcta para @db.Date de Prisma.
function fechaDate(fechaStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    throw new AppError("VALIDATION_ERROR", `fecha inválida: ${fechaStr}`, 400);
  }
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
// La fórmula NO vive aquí: vive en `@brasas/shared` porque la calculan dos lados. El POS
// la necesita para mostrar el esperado en caja en vivo e imprimir el corte estando
// offline; este servicio la recalcula al recibir el cierre. Con copias separadas podrían
// divergir sin que nadie lo note, y el número que el dueño usa para confiar en el sistema
// sería distinto según quién lo calcule.
export { calcularEsperadoEnCaja };

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
  // Filtra por día de operación, no por rango de timestamps. Una venta hecha a las 16:00
  // y sincronizada a las 00:30 cuenta en la jornada en que se hizo.
  const base = { sucursalId, fechaOperativa: fechaDate(fecha) };

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
  const pedidos = await prisma.pedido.findMany({
    where: { sucursalId, fechaOperativa: fechaDate(fecha) },
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
  // Día de operación al que pertenece el movimiento, estampado por la terminal.
  fecha: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
}

function mapearMovimiento(m: {
  id: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: { toNumber(): number };
  creadoEn: Date;
}): MovimientoCajaInfo {
  return {
    id: m.id,
    tipo: m.tipo,
    concepto: m.concepto,
    monto: m.monto.toNumber(),
    creadoEn: m.creadoEn.toISOString(),
  };
}

export async function registrarMovimiento(
  input: RegistrarMovimientoInput,
): Promise<MovimientoCajaInfo> {
  const fd = fechaDate(input.fecha);

  await asegurarDiaAbierto(input.sucursalId, fd);

  // Idempotente: reenviar el mismo UUID (sync offline) no duplica el movimiento.
  const existente = await prisma.movimientoCaja.findUnique({ where: { id: input.id } });
  if (existente) return mapearMovimiento(existente);

  try {
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
    return mapearMovimiento(movimiento);
  } catch (err) {
    // Dos reenvíos concurrentes del mismo UUID: el otro ganó la carrera entre el findUnique
    // y el create. Es idempotencia, no un error — devolvemos el que quedó.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const ganador = await prisma.movimientoCaja.findUnique({ where: { id: input.id } });
      if (ganador) return mapearMovimiento(ganador);
    }
    throw err;
  }
}

export async function eliminarMovimiento(id: string, sucursalId: string): Promise<void> {
  const movimiento = await prisma.movimientoCaja.findUnique({
    where: { id },
    select: { id: true, sucursalId: true, fecha: true, cierreDiaId: true },
  });

  if (!movimiento) {
    // Idempotente: si ya no está, el borrado ya se aplicó. Reenviarlo no es un error.
    return;
  }
  if (movimiento.sucursalId !== sucursalId) {
    throw new AppError("FORBIDDEN", "El movimiento no pertenece a esta sucursal", 403);
  }

  // Un movimiento sellado por un cierre es INMUTABLE. Borrarlo cambiaría un corte que el
  // dueño ya dio por bueno y firmó. Esta es la garantía que antes se conseguía copiando
  // las filas a otra tabla; ahora es una regla explícita sobre una sola tabla.
  if (movimiento.cierreDiaId !== null) {
    throw new AppError(
      "CONFLICT",
      "El movimiento pertenece a un día ya cerrado y no puede modificarse",
      409,
    );
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

// La fecha la pasa la terminal: es la única que sabe en qué jornada está operando.
export async function estadoCaja(sucursalId: string, fecha: string): Promise<EstadoCaja> {
  const fd = fechaDate(fecha);

  const [apertura, cierreRow, movimientos] = await Promise.all([
    prisma.aperturaDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha: fd } },
    }),
    prisma.cierreDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha: fd } },
      include: CON_MOVIMIENTOS,
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
  // Día de operación que se abre, estampado por la terminal.
  fecha: string;
  fondoInicial: number;
  notas?: string;
}

export async function abrirDia(input: AbrirDiaInput): Promise<void> {
  const fd = fechaDate(input.fecha);

  const existe = await prisma.aperturaDia.findUnique({
    where: { sucursalId_fecha: { sucursalId: input.sucursalId, fecha: fd } },
    select: { id: true },
  });

  if (existe) {
    // Idempotente: si es la MISMA apertura reenviada (mismo UUID de cliente), no es un
    // error — es un reintento de sincronización. Solo es conflicto si alguien intenta
    // abrir el mismo día dos veces con aperturas distintas (RN-08).
    if (existe.id === input.id) return;

    throw new AppError("CONFLICT", "Ya existe una apertura para ese día", 409);
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
  // Día de operación que se cierra, estampado por la terminal.
  fecha: string;
  conteoFisico: number;
  notas?: string;
}

interface MovimientoRow {
  id: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: { toNumber(): number };
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
  // Los movimientos que este cierre selló. Ya no hay copias en otras tablas: el desglose
  // de gastos y entradas se deriva del tipo de cada movimiento.
  movimientos: MovimientoRow[];
}

// Cómo incluir los movimientos sellados al leer un cierre. Se usa en todas las consultas
// que devuelven un CierreInfo, para que el desglose siempre venga completo y ordenado.
const CON_MOVIMIENTOS = { movimientos: { orderBy: { creadoEn: "asc" } } } as const;

function mapearCierre(cierre: CierreRow): CierreInfo {
  const linea = (m: MovimientoRow) => ({
    id: m.id,
    concepto: m.concepto,
    monto: m.monto.toNumber(),
  });

  const gastos = cierre.movimientos.filter((m) => m.tipo === "GASTO").map(linea);
  const entradas = cierre.movimientos.filter((m) => m.tipo === "ENTRADA").map(linea);

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
  const fecha = input.fecha;
  const fd = fechaDate(fecha);

  const apertura = await prisma.aperturaDia.findUnique({
    where: { sucursalId_fecha: { sucursalId: input.sucursalId, fecha: fd } },
    select: { fondoInicial: true },
  });
  if (!apertura) {
    throw new AppError("PRECONDITION_FAILED", "No existe apertura para ese día", 422);
  }

  const cierreExiste = await prisma.cierreDia.findUnique({
    where: { sucursalId_fecha: { sucursalId: input.sucursalId, fecha: fd } },
    include: CON_MOVIMIENTOS,
  });

  if (cierreExiste) {
    // Idempotente: reenviar el mismo cierre (mismo UUID) devuelve el que ya existe.
    // Solo es conflicto si se intenta cerrar dos veces el mismo día (RN-08).
    if (cierreExiste.id === input.id) return mapearCierre(cierreExiste);

    throw new AppError("CONFLICT", "Ya existe un cierre para ese día", 409);
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
  const diferencia = calcularDiferencia(input.conteoFisico, esperadoEnCaja);

  // El cierre SELLA los movimientos del día en vez de copiarlos a otras tablas.
  //
  // Antes se creaban filas nuevas en GastoDia/EntradaDia reutilizando el mismo UUID: dos
  // registros del mismo hecho, en tablas distintas, sin FK que los relacionara. Ahora hay
  // una sola fila por movimiento, y su `cierreDiaId` dice a qué corte pertenece. A partir
  // de ese momento es inmutable (eliminarMovimiento lo rechaza).
  //
  // Todo en una transacción: un cierre creado sin sellar sus movimientos dejaría el corte
  // separado de las líneas que lo componen, y esas líneas seguirían siendo editables.
  const cierre = await prisma.$transaction(async (tx) => {
    const creado = await tx.cierreDia.create({
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
      },
    });

    await tx.movimientoCaja.updateMany({
      where: { sucursalId: input.sucursalId, fecha: fd, cierreDiaId: null },
      data: { cierreDiaId: creado.id },
    });

    return tx.cierreDia.findUniqueOrThrow({
      where: { id: creado.id },
      include: CON_MOVIMIENTOS,
    });
  });

  return mapearCierre(cierre);
}
