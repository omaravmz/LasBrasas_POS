import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import type { TipoMovimientoInventario, TipoReferencia } from "@prisma/client";

// Libro mayor de inventario (BD-09).
//
// LA REGLA: `InventarioInsumo.cantidad` NO es la verdad. Es un saldo derivado —una vista
// materializada— de `MovimientoInventario`, que se actualiza en la MISMA transacción que
// asienta el movimiento. La verdad es el ledger, y solo el ledger se puede reconstruir.
//
// Antes, el saldo era un número mutable sin historia. No había forma de responder "¿por
// qué el inventario dice 3.2 kg?", ni de reconstruirlo, ni de revertir con confianza el
// descuento de una venta cancelada (RN-05) salvo recalculando la receta — que pudo haber
// cambiado desde la venta. Un error ahí corrompe el inventario en silencio, que es el
// riesgo técnico #3 del proyecto (CONTEXT.md §10).
//
// Todas las cantidades están en la unidadBase del insumo (gramos, mililitros o piezas).
// Esta capa NUNCA convierte unidades: si aquí aparece un kilo, algo se coló desde el borde.

const Decimal = Prisma.Decimal;

export interface MovimientoInput {
  sucursalId: string;
  insumoId: string;
  // CON SIGNO: positiva entra, negativa sale. En la unidadBase del insumo.
  cantidad: number;
  tipo: TipoMovimientoInventario;
  refTipo: TipoReferencia;
  refId: string;
  fechaOperativa: string; // "YYYY-MM-DD"
  notas?: string;
}

function fechaDate(fecha: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new AppError("VALIDATION_ERROR", `fechaOperativa inválida: ${fecha}`, 400);
  }
  return new Date(`${fecha}T00:00:00.000Z`);
}

// ---------------------------------------------------------------------------
// Asentar movimientos
// ---------------------------------------------------------------------------
//
// Es TODO O NADA. Si un solo insumo es insuficiente, no se asienta ninguno: un pedido no
// puede descontar la carne y quedarse sin tortillas a medio camino (RN-11).
//
// Debe llamarse SIEMPRE dentro de una transacción del llamador, junto con la operación que
// origina los movimientos (crear el pedido, confirmar el traslado...). Si el pedido se
// guarda y el descuento no, el inventario miente.
export async function asentarMovimientos(
  tx: Prisma.TransactionClient,
  movimientos: readonly MovimientoInput[],
): Promise<void> {
  if (movimientos.length === 0) return;

  for (const mov of movimientos) {
    if (mov.cantidad === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Un movimiento de inventario no puede ser de cantidad cero",
        400,
        { insumoId: mov.insumoId, refId: mov.refId },
      );
    }
  }

  // Idempotencia: si esta operación ya asentó su efecto, no se repite.
  //
  // Es el caso NORMAL en la arquitectura offline, no un error: la terminal reenvía un
  // pedido tras un timeout y no debe descontar el inventario dos veces. La restricción
  // única (refTipo, refId, sucursalId, insumoId, tipo) lo garantiza a nivel de base; aquí
  // se comprueba antes para poder salir sin ruido.
  const yaAsentados = await tx.movimientoInventario.findMany({
    where: {
      OR: movimientos.map((m) => ({
        refTipo: m.refTipo,
        refId: m.refId,
        sucursalId: m.sucursalId,
        insumoId: m.insumoId,
        tipo: m.tipo,
      })),
    },
    select: { refTipo: true, refId: true, sucursalId: true, insumoId: true, tipo: true },
  });

  const clave = (m: {
    refTipo: string;
    refId: string;
    sucursalId: string;
    insumoId: string;
    tipo: string;
  }): string => `${m.refTipo}|${m.refId}|${m.sucursalId}|${m.insumoId}|${m.tipo}`;

  const existentes = new Set(yaAsentados.map(clave));
  const pendientes = movimientos.filter((m) => !existentes.has(clave(m)));

  if (pendientes.length === 0) return;

  // Un mismo insumo puede recibir varios movimientos en la misma operación (p. ej. una
  // mezcla de cortes descuenta el mismo insumo desde varias líneas). Se agrupa para
  // aplicar un solo delta al saldo y comprobar la suficiencia sobre el neto.
  const deltaPorSaldo = new Map<string, { sucursalId: string; insumoId: string; delta: Prisma.Decimal }>();

  for (const mov of pendientes) {
    const k = `${mov.sucursalId}|${mov.insumoId}`;
    const actual = deltaPorSaldo.get(k);
    const cantidad = new Decimal(mov.cantidad);

    if (actual) actual.delta = actual.delta.plus(cantidad);
    else deltaPorSaldo.set(k, { sucursalId: mov.sucursalId, insumoId: mov.insumoId, delta: cantidad });
  }

  // 1. Comprobar suficiencia ANTES de escribir nada.
  for (const { sucursalId, insumoId, delta } of deltaPorSaldo.values()) {
    if (delta.greaterThanOrEqualTo(0)) continue; // entra: nunca falta

    const saldo = await tx.inventarioInsumo.findUnique({
      where: { sucursalId_insumoId: { sucursalId, insumoId } },
      select: { cantidad: true },
    });

    const disponible = saldo?.cantidad ?? new Decimal(0);
    const resultante = disponible.plus(delta);

    if (resultante.lessThan(0)) {
      const insumo = await tx.insumo.findUnique({
        where: { id: insumoId },
        select: { nombre: true, unidadBase: true },
      });

      throw new AppError(
        "INVENTARIO_INSUFICIENTE",
        `Inventario insuficiente de ${insumo?.nombre ?? insumoId}`,
        422,
        {
          insumoId,
          insumo: insumo?.nombre,
          unidad: insumo?.unidadBase,
          disponible: disponible.toFixed(3),
          requerido: delta.abs().toFixed(3),
        },
      );
    }
  }

  // 2. Asentar el ledger (append-only: nunca se edita ni se borra).
  await tx.movimientoInventario.createMany({
    data: pendientes.map((m) => ({
      sucursalId: m.sucursalId,
      insumoId: m.insumoId,
      cantidad: new Decimal(m.cantidad),
      tipo: m.tipo,
      refTipo: m.refTipo,
      refId: m.refId,
      fechaOperativa: fechaDate(m.fechaOperativa),
      notas: m.notas ?? null,
    })),
  });

  // 3. Actualizar el saldo derivado, en la misma transacción.
  for (const { sucursalId, insumoId, delta } of deltaPorSaldo.values()) {
    await tx.inventarioInsumo.upsert({
      where: { sucursalId_insumoId: { sucursalId, insumoId } },
      create: {
        sucursalId,
        insumoId,
        cantidad: delta,
        ultimoMovimiento: new Date(),
      },
      update: {
        cantidad: { increment: delta },
        ultimoMovimiento: new Date(),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Reversión
// ---------------------------------------------------------------------------
//
// Cancelar un pedido revierte su descuento (RN-05). No se recalcula la receta: se leen los
// movimientos que ESA venta asentó y se asienta su opuesto exacto. Da igual que la receta o
// los precios hayan cambiado desde entonces — se devuelve lo que realmente se descontó.
//
// Esa es la diferencia entera respecto al modelo anterior, donde el saldo mutable no
// guardaba memoria de cuánto se había descontado y la reversión tenía que adivinarlo.
export async function revertirMovimientos(
  tx: Prisma.TransactionClient,
  refTipo: TipoReferencia,
  refId: string,
  tipoReversion: TipoMovimientoInventario,
  fechaOperativa: string,
): Promise<void> {
  const originales = await tx.movimientoInventario.findMany({
    where: { refTipo, refId, tipo: { notIn: [tipoReversion] } },
  });

  if (originales.length === 0) return;

  await asentarMovimientos(
    tx,
    originales.map((m) => ({
      sucursalId: m.sucursalId,
      insumoId: m.insumoId,
      cantidad: m.cantidad.negated().toNumber(), // el opuesto exacto
      tipo: tipoReversion,
      refTipo,
      refId,
      fechaOperativa,
    })),
  );
}

// ---------------------------------------------------------------------------
// Reconstrucción y auditoría
// ---------------------------------------------------------------------------

// Saldo de un insumo según el LEDGER, no según la tabla de saldos. Sirve para auditar que
// el saldo materializado no se ha desviado de su fuente.
export async function saldoSegunLedger(
  sucursalId: string,
  insumoId: string,
): Promise<Prisma.Decimal> {
  const suma = await prisma.movimientoInventario.aggregate({
    where: { sucursalId, insumoId },
    _sum: { cantidad: true },
  });

  return suma._sum.cantidad ?? new Decimal(0);
}

export interface Descuadre {
  sucursalId: string;
  insumoId: string;
  insumo: string;
  saldoMaterializado: string;
  saldoLedger: string;
}

// Compara todos los saldos contra el ledger. En un sistema sano devuelve una lista vacía;
// cualquier fila es un bug que hay que investigar, no un dato que redondear.
export async function auditarSaldos(): Promise<Descuadre[]> {
  const saldos = await prisma.inventarioInsumo.findMany({
    include: { insumo: { select: { nombre: true } } },
  });

  const descuadres: Descuadre[] = [];

  for (const saldo of saldos) {
    const segunLedger = await saldoSegunLedger(saldo.sucursalId, saldo.insumoId);

    if (!saldo.cantidad.equals(segunLedger)) {
      descuadres.push({
        sucursalId: saldo.sucursalId,
        insumoId: saldo.insumoId,
        insumo: saldo.insumo.nombre,
        saldoMaterializado: saldo.cantidad.toFixed(3),
        saldoLedger: segunLedger.toFixed(3),
      });
    }
  }

  return descuadres;
}

// ---------------------------------------------------------------------------
// BD-11 · Transformaciones permitidas
// ---------------------------------------------------------------------------

// Valida que la conversión insumo→insumo esté permitida en esa sucursal, y devuelve el
// factor. La regla vive en la BASE, no en una constante del código: cambiarla ya no exige
// desplegar.
export async function validarTransformacion(
  tx: Prisma.TransactionClient,
  sucursalId: string,
  insumoOrigenId: string,
  insumoDestinoId: string,
): Promise<Prisma.Decimal> {
  const permitida = await tx.transformacionPermitida.findFirst({
    where: {
      insumoOrigenId,
      insumoDestinoId,
      activo: true,
      // null = permitida en cualquier sucursal.
      OR: [{ sucursalId }, { sucursalId: null }],
    },
  });

  if (!permitida) {
    throw new AppError(
      "TRANSFORMACION_NO_PERMITIDA",
      "Esa transformación de insumos no está permitida en esta sucursal",
      422,
      { sucursalId, insumoOrigenId, insumoDestinoId },
    );
  }

  return permitida.factor;
}
