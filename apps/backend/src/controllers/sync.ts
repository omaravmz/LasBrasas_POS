import type { Request, Response, NextFunction } from "express";
import { sincronizarPedidosLote, type PedidoSyncInput } from "../services/sync.js";
import { AppError } from "../middleware/errorHandler.js";

export async function postSyncPedidos(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dispositivo = req.dispositivo;
    if (!dispositivo) throw new AppError("AUTH_REQUIRED", "Autenticación requerida", 401);

    const { pedidos } = req.body as { pedidos: PedidoSyncInput[] };

    if (!Array.isArray(pedidos) || pedidos.length === 0) {
      throw new AppError("VALIDATION_ERROR", "pedidos debe ser un array no vacío", 400);
    }

    const resultado = await sincronizarPedidosLote(
      pedidos,
      dispositivo.sucursalId,
      dispositivo.id
    );

    res.json(resultado);
  } catch (err) {
    next(err);
  }
}
