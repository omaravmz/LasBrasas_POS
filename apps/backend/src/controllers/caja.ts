import type { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler.js";
import {
  estadoCaja,
  abrirDia,
  cerrarDia,
  listarPedidosDia,
  calcularVentasDia,
  registrarMovimiento,
  eliminarMovimiento,
} from "../services/caja.js";
import type { TipoMovimientoCaja } from "@prisma/client";

const TIPOS_MOVIMIENTO: TipoMovimientoCaja[] = ["ENTRADA", "GASTO"];

// Mazatlan = UTC-7 (sin DST desde 2023)
function fechaMazatlanHoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mazatlan" }).format(new Date());
}

// GET /caja/estado
export async function getEstadoCaja(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sucursalId } = req.dispositivo!;
    res.json(await estadoCaja(sucursalId));
  } catch (err) {
    next(err);
  }
}

// GET /caja/ventas — pedidos del día (incluye cancelados) + resumen por método de pago
export async function getVentasDia(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sucursalId } = req.dispositivo!;
    const fecha = fechaMazatlanHoy();

    const [resumen, pedidos] = await Promise.all([
      calcularVentasDia(sucursalId, fecha),
      listarPedidosDia(sucursalId, fecha),
    ]);

    res.json({ fecha, resumen, pedidos });
  } catch (err) {
    next(err);
  }
}

// POST /caja/apertura
export async function postApertura(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sucursalId } = req.dispositivo!;
    const { id, fondoInicial, notas } = req.body as {
      id: string;
      fondoInicial: number;
      notas?: string;
    };

    if (!id || fondoInicial == null || typeof fondoInicial !== "number" || fondoInicial < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Los campos id y fondoInicial (número ≥ 0) son requeridos",
        400,
      );
    }

    await abrirDia({ id, sucursalId, fondoInicial, ...(notas !== undefined && { notas }) });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /caja/movimientos — registra una entrada o un retiro/gasto en vivo
export async function postMovimiento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sucursalId } = req.dispositivo!;
    const { id, tipo, concepto, monto } = req.body as {
      id: string;
      tipo: TipoMovimientoCaja;
      concepto: string;
      monto: number;
    };

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "El campo id es requerido", 400);
    }
    if (!TIPOS_MOVIMIENTO.includes(tipo)) {
      throw new AppError("VALIDATION_ERROR", "El tipo debe ser ENTRADA o GASTO", 400);
    }
    if (!concepto?.trim()) {
      throw new AppError("VALIDATION_ERROR", "El concepto es requerido", 400);
    }
    if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0) {
      throw new AppError("VALIDATION_ERROR", "El monto debe ser un número mayor a 0", 400);
    }

    const movimiento = await registrarMovimiento({
      id,
      sucursalId,
      tipo,
      concepto: concepto.trim(),
      monto,
    });

    res.status(201).json(movimiento);
  } catch (err) {
    next(err);
  }
}

// DELETE /caja/movimientos/:id
export async function deleteMovimiento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sucursalId } = req.dispositivo!;
    const { id } = req.params as { id: string };

    await eliminarMovimiento(id, sucursalId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /caja/cierre
export async function postCierre(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sucursalId } = req.dispositivo!;
    const { id, conteoFisico, notas } = req.body as {
      id: string;
      conteoFisico: number;
      notas?: string;
    };

    if (!id || conteoFisico == null || typeof conteoFisico !== "number" || conteoFisico < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Los campos id y conteoFisico (número ≥ 0) son requeridos",
        400,
      );
    }

    const cierre = await cerrarDia({
      id,
      sucursalId,
      conteoFisico,
      ...(notas !== undefined && { notas }),
    });
    res.status(201).json(cierre);
  } catch (err) {
    next(err);
  }
}
