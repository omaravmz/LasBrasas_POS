import type { Request, Response, NextFunction } from "express";
import { folioMaximo } from "../services/sync.js";
import { AppError } from "../middleware/errorHandler.js";

// Folio más alto que el servidor conoce para un día de operación.
//
// La terminal deriva su folio de sus propios pedidos locales (ver BD-03), lo cual la
// protege de que un contador paralelo se desvíe de los datos. Pero no la protege del
// caso en que la terminal PIERDA pedidos: restaurada desde un respaldo viejo, su MAX
// local queda por debajo del real y volvería a emitir folios ya usados.
//
// Este endpoint cierra ese hueco: el servidor sabe cuál fue el último folio que recibió.
export async function getFolioMaximo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dispositivo = req.dispositivo;
    if (!dispositivo) {
      throw new AppError("AUTH_REQUIRED", "Autenticación requerida", 401);
    }

    const fecha = req.query["fecha"];

    if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new AppError("VALIDATION_ERROR", "fecha requerida en formato YYYY-MM-DD", 400);
    }

    const maximo = await folioMaximo(
      dispositivo.sucursalId,
      new Date(`${fecha}T00:00:00.000Z`),
    );

    res.json({ folioMaximo: maximo });
  } catch (err) {
    next(err);
  }
}
