import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

export async function getPedidosActivos(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dispositivo = req.dispositivo!;

    const inicioDia = new Date();
    inicioDia.setUTCHours(0, 0, 0, 0);

    const pedidos = await prisma.pedido.findMany({
      where: {
        sucursalId: dispositivo.sucursalId,
        estado: { not: "CANCELADO" },
        creadoEn: { gte: inicioDia },
      },
      include: {
        items: {
          include: {
            producto: { select: { nombre: true } },
          },
        },
      },
      orderBy: { creadoEn: "asc" },
    });

    res.json(
      pedidos.map((p) => ({
        id: p.id,
        folio: p.folio,
        estado: p.estado,
        origen: p.origen,
        total: Number(p.total),
        ...(p.notas !== null && { notas: p.notas }),
        ...(p.horaRecoleccion !== null && { horaRecoleccion: p.horaRecoleccion.toISOString() }),
        creadoEn: p.creadoEn.toISOString(),
        items: p.items.map((i) => ({
          id: i.id,
          cantidad: i.cantidad,
          productoNombre: i.producto.nombre,
          ...(i.notas !== null && { notas: i.notas }),
        })),
      }))
    );
  } catch (err) {
    next(err);
  }
}
