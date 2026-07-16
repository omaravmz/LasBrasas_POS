import type { Request, Response, NextFunction } from "express";
import { HEADER_VERSION, VERSION_CONTRATO_MINIMA, CodigoError } from "@brasas/shared";
import { AppError } from "./errorHandler.js";

// Handshake de versión de cliente. Ver DISENO_BLOQUE1.md §1.
//
// Una terminal offline puede tener decenas de operaciones encoladas con el formato de
// un build viejo cuando se despliega un backend nuevo. No hay "deploy atómico" que evite
// esa ventana: esas operaciones son ventas reales, con dinero ya en el cajón.
//
// En vez de dejar que fallen con errores de validación crípticos (y que el POS no sepa
// si reintentar o descartar), el backend las rechaza con un código explícito. El POS
// reconoce el 426, bloquea la sincronización, sigue vendiendo con normalidad, y retiene
// la cola hasta que la app se actualice.
//
// Un header ausente se trata como versión 0: es exactamente lo que envía un build
// anterior al handshake, y debe rechazarse igual.
export function requireAppVersion(req: Request, _res: Response, next: NextFunction): void {
  const crudo = req.headers[HEADER_VERSION];
  const version = typeof crudo === "string" ? Number.parseInt(crudo, 10) : 0;
  const versionCliente = Number.isFinite(version) ? version : 0;

  if (versionCliente < VERSION_CONTRATO_MINIMA) {
    next(
      new AppError(
        CodigoError.CLIENTE_DESACTUALIZADO,
        "La aplicación está desactualizada. Actualízala para poder sincronizar.",
        426,
        { versionCliente, versionMinima: VERSION_CONTRATO_MINIMA },
      ),
    );
    return;
  }

  next();
}
