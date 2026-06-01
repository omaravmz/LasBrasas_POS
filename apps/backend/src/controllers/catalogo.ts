import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

export async function getCatalogo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [categorias, productos] = await Promise.all([
      prisma.categoria.findMany({
        orderBy: { orden: "asc" },
        select: { id: true, nombre: true, orden: true },
      }),
      prisma.producto.findMany({
        where: { activo: true },
        orderBy: { orden: "asc" },
        select: {
          id: true,
          categoriaId: true,
          nombre: true,
          descripcion: true,
          precio: true,
          activo: true,
          requiereCorte: true,
          gramosBase: true,
          orden: true,
          variantes: {
            orderBy: { nombre: "asc" },
            select: {
              id: true,
              nombre: true,
              grupoPrecio: true,
              activo: true,
            },
          },
        },
      }),
    ]);

    res.json({
      categorias,
      productos: productos.map((p) => ({
        ...p,
        precio: Number(p.precio),
      })),
      sucursalId: req.dispositivo!.sucursalId,
      sucursalNombre: req.dispositivo!.sucursal.nombre,
      dispositivoId: req.dispositivo!.id,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
