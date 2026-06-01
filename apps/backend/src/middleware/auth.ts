import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./errorHandler.js";

// ---------------------------------------------------------------------------
// Autenticación de terminal — X-Device-Token
// Resuelve la sucursal a partir del token del dispositivo.
// ---------------------------------------------------------------------------
export async function authDevice(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.headers["x-device-token"];

    if (!token || typeof token !== "string") {
      throw new AppError("AUTH_MISSING_TOKEN", "Token de dispositivo requerido", 401);
    }

    const dispositivo = await prisma.dispositivo.findUnique({
      where: { token },
      include: { sucursal: true },
    });

    if (!dispositivo || !dispositivo.activo) {
      throw new AppError("AUTH_INVALID_TOKEN", "Token de dispositivo inválido o inactivo", 401);
    }

    req.dispositivo = dispositivo;
    next();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Autenticación de usuario — JWT Bearer
// Para dueño / administrador.
// ---------------------------------------------------------------------------
export function authJwt(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers["authorization"];

    if (!header?.startsWith("Bearer ")) {
      throw new AppError("AUTH_MISSING_TOKEN", "Token de autorización requerido", 401);
    }

    const token = header.slice(7);
    const secret = process.env["JWT_SECRET"];

    if (!secret) {
      throw new AppError("CONFIG_ERROR", "JWT_SECRET no configurado", 500);
    }

    const payload = jwt.verify(token, secret) as { sub: string; rol: string };
    req.usuarioId = payload.sub;
    req.usuarioRol = payload.rol;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError("AUTH_INVALID_TOKEN", "Token inválido o expirado", 401));
  }
}
