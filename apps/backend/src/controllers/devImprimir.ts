import type { Request, Response, NextFunction } from "express";
import { DevImpresoraService } from "../impresora/DevImpresoraService.js";
import type { DatosTicket } from "../impresora/ticket.js";
import { AppError } from "../middleware/errorHandler.js";

const devImpresora = new DevImpresoraService();

// Solo disponible fuera de producción
export async function postDevImprimir(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (process.env["NODE_ENV"] === "production") {
      throw new AppError("NOT_FOUND", "Ruta no disponible", 404);
    }

    const datos = req.body as DatosTicket;
    if (!datos.folio || !datos.lineas || !datos.metodoPago) {
      throw new AppError("VALIDATION_ERROR", "DatosTicket inválidos", 400);
    }

    // fecha llega como string desde el frontend
    datos.fecha = new Date(datos.fecha as unknown as string);

    await devImpresora.imprimir(datos);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
