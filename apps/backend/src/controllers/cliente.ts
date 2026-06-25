import type { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler.js";
import {
  buscarClientePorTelefono,
  crearCliente,
  agregarDireccion,
  marcarDireccionPrincipal,
} from "../services/cliente.js";

// GET /clientes?telefono=XXX
export async function getCliente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { telefono } = req.query as { telefono?: string };
    if (!telefono?.trim()) {
      throw new AppError("VALIDATION_ERROR", "El parámetro telefono es requerido", 400);
    }
    const cliente = await buscarClientePorTelefono(telefono.trim());
    if (!cliente) {
      res.status(404).json({ code: "NOT_FOUND", message: "Cliente no encontrado" });
      return;
    }
    res.json(cliente);
  } catch (err) {
    next(err);
  }
}

// POST /clientes
export async function postCliente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id, telefono, nombre } = req.body as {
      id: string;
      telefono: string;
      nombre?: string;
    };

    if (!id || !telefono?.trim()) {
      throw new AppError("VALIDATION_ERROR", "Los campos id y telefono son requeridos", 400);
    }

    const cliente = await crearCliente(id, telefono.trim(), nombre?.trim() || undefined);
    res.status(201).json(cliente);
  } catch (err: unknown) {
    // Unique constraint → teléfono duplicado
    if (
      typeof err === "object" && err !== null &&
      "code" in err && (err as { code: string }).code === "P2002"
    ) {
      next(new AppError("CONFLICT", "Ya existe un cliente con ese teléfono", 409));
      return;
    }
    next(err);
  }
}

// POST /clientes/:id/direcciones
export async function postDireccion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: clienteId } = req.params as { id: string };
    const { id, direccion, referencia } = req.body as {
      id: string;
      direccion: string;
      referencia?: string;
    };

    if (!id || !direccion?.trim()) {
      throw new AppError("VALIDATION_ERROR", "Los campos id y direccion son requeridos", 400);
    }

    const dir = await agregarDireccion(
      clienteId,
      id,
      direccion.trim(),
      referencia?.trim() || undefined,
    );
    res.status(201).json(dir);
  } catch (err) {
    next(err);
  }
}

// PATCH /clientes/:id/direcciones/:dirId  { esPrincipal: true }
export async function patchDireccion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: clienteId, dirId } = req.params as { id: string; dirId: string };
    await marcarDireccionPrincipal(clienteId, dirId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
