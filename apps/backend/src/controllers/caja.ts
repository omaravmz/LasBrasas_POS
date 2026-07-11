import type { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler.js";
import { estadoCaja, abrirDia, cerrarDia } from "../services/caja.js";
import type { GastoInput, EntradaInput } from "../services/caja.js";

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

// POST /caja/cierre
export async function postCierre(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sucursalId } = req.dispositivo!;
    const { id, conteoFisico, notas, gastos = [], entradas = [] } = req.body as {
      id: string;
      conteoFisico: number;
      notas?: string;
      gastos?: GastoInput[];
      entradas?: EntradaInput[];
    };

    if (!id || conteoFisico == null || typeof conteoFisico !== "number" || conteoFisico < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Los campos id y conteoFisico (número ≥ 0) son requeridos",
        400,
      );
    }

    for (const g of gastos) {
      if (!g.id || !g.concepto?.trim() || typeof g.monto !== "number" || g.monto < 0) {
        throw new AppError("VALIDATION_ERROR", "Cada gasto requiere id, concepto y monto ≥ 0", 400);
      }
    }

    for (const e of entradas) {
      if (!e.id || !e.concepto?.trim() || typeof e.monto !== "number" || e.monto <= 0) {
        throw new AppError("VALIDATION_ERROR", "Cada entrada requiere id, concepto y monto > 0", 400);
      }
    }

    const cierre = await cerrarDia({ id, sucursalId, conteoFisico, gastos, entradas, ...(notas !== undefined && { notas }) });
    res.status(201).json(cierre);
  } catch (err) {
    next(err);
  }
}
