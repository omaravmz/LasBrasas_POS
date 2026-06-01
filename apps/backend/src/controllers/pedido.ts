import type { Request, Response, NextFunction } from "express";
import { crearPedido, type CrearPedidoInput } from "../services/pedido.js";
import { AppError } from "../middleware/errorHandler.js";
import type { MetodoPago, OrigenPedido } from "@prisma/client";

const ORIGENES_VALIDOS: OrigenPedido[] = ["MOSTRADOR", "TELEFONO", "WHATSAPP", "DELIVERY"];
const METODOS_VALIDOS: MetodoPago[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];

export async function postPedido(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dispositivo = req.dispositivo;
    if (!dispositivo) {
      throw new AppError("AUTH_REQUIRED", "Autenticación requerida", 401);
    }

    const body = req.body as Partial<CrearPedidoInput>;

    if (
      typeof body.id !== "string" ||
      typeof body.folio !== "number" ||
      typeof body.total !== "number" ||
      !body.origen ||
      !body.metodoPago ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      throw new AppError("VALIDATION_ERROR", "Campos requeridos faltantes o inválidos", 400);
    }

    if (!ORIGENES_VALIDOS.includes(body.origen)) {
      throw new AppError("VALIDATION_ERROR", `origen inválido: ${body.origen}`, 400);
    }

    if (!METODOS_VALIDOS.includes(body.metodoPago)) {
      throw new AppError("VALIDATION_ERROR", `metodoPago inválido: ${body.metodoPago}`, 400);
    }

    const clienteId = typeof body.clienteId === "string" ? body.clienteId : undefined;
    const notas = typeof body.notas === "string" ? body.notas : undefined;

    const input: CrearPedidoInput = {
      id: body.id,
      folio: body.folio,
      sucursalId: dispositivo.sucursalId,
      dispositivoId: dispositivo.id,
      ...(clienteId !== undefined && { clienteId }),
      origen: body.origen,
      metodoPago: body.metodoPago,
      total: body.total,
      ...(notas !== undefined && { notas }),
      items: body.items,
    };

    const pedido = await crearPedido(input);
    res.status(201).json(pedido);
  } catch (err) {
    next(err);
  }
}
