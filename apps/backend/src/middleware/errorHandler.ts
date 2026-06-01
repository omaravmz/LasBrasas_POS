import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public override readonly message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  // Error no controlado — no exponer detalles en producción
  const isProduction = process.env["NODE_ENV"] === "production";
  console.error(err);

  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Error interno del servidor",
    details: isProduction ? undefined : err,
  });
}
