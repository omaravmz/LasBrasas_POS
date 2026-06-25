import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { cancelarPedido } from "../services/pedido.js";
import type { EstadoPedido } from "@prisma/client";

const TRANSICIONES_VALIDAS: Partial<Record<EstadoPedido, EstadoPedido[]>> = {
  PENDIENTE: ["LISTO", "CANCELADO"],
  LISTO: ["ENTREGADO", "CANCELADO"],
};

export async function patchPedidoEstado(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { estado: nuevoEstado } = req.body as { estado: EstadoPedido };
    const dispositivo = req.dispositivo!;

    if (!nuevoEstado) {
      throw new AppError("VALIDATION_ERROR", "El campo estado es requerido", 400);
    }

    const pedido = await prisma.pedido.findUnique({
      where: { id },
      select: { id: true, estado: true, sucursalId: true, metodoPago: true, total: true },
    });

    if (!pedido) {
      throw new AppError("NOT_FOUND", "Pedido no encontrado", 404);
    }

    if (pedido.sucursalId !== dispositivo.sucursalId) {
      throw new AppError("FORBIDDEN", "El pedido no pertenece a esta sucursal", 403);
    }

    const permitidos = TRANSICIONES_VALIDAS[pedido.estado] ?? [];
    if (!permitidos.includes(nuevoEstado)) {
      throw new AppError(
        "INVALID_TRANSITION",
        `No se puede pasar de ${pedido.estado} a ${nuevoEstado}`,
        422,
      );
    }

    if (nuevoEstado === "CANCELADO") {
      const resultado = await cancelarPedido({
        id: pedido.id,
        metodoPago: pedido.metodoPago,
        total: pedido.total,
      });
      res.json({ id: resultado.id, estado: resultado.estado, actualizadoEn: resultado.actualizadoEn });
      return;
    }

    const actualizado = await prisma.pedido.update({
      where: { id },
      data: { estado: nuevoEstado },
      select: { id: true, estado: true, actualizadoEn: true },
    });

    res.json(actualizado);
  } catch (err) {
    next(err);
  }
}
