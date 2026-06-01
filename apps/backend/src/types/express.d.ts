import type { Dispositivo, Sucursal } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      // Presente en rutas autenticadas con X-Device-Token
      dispositivo?: Dispositivo & { sucursal: Sucursal };
      // Presente en rutas autenticadas con JWT (dueño/admin)
      usuarioId?: string;
      usuarioRol?: string;
    }
  }
}
