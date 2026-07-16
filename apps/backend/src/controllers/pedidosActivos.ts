import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";

// GET /pedidos/activos?fecha=YYYY-MM-DD
//
// La jornada la manda la terminal, no el reloj del servidor. Filtrar por `creadoEn` contra
// la medianoche UTC era el antipatrón que BD-02 eliminó en el resto del sistema: durante la
// venta (12–5pm Mazatlán = 19:00–00:00 UTC) el día UTC ya puede haber cambiado, y pedidos
// de la MISMA jornada desaparecían de la vista. Se filtra por `fechaOperativa`, la que
// estampó la terminal al cobrar, igual que los endpoints de caja.
export async function getPedidosActivos(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dispositivo = req.dispositivo!;

    const fecha = req.query["fecha"];
    if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new AppError("VALIDATION_ERROR", "fecha requerida en formato YYYY-MM-DD", 400);
    }
    const fechaOperativa = new Date(`${fecha}T00:00:00.000Z`);

    const pedidos = await prisma.pedido.findMany({
      where: {
        sucursalId: dispositivo.sucursalId,
        estado: { not: "CANCELADO" },
        fechaOperativa,
      },
      // El nombre sale del SNAPSHOT del ítem (BD-15), no del catálogo actual. Si se leyera
      // `producto.nombre`, renombrar un producto cambiaría retroactivamente lo que dicen
      // los pedidos ya vendidos y sus tickets.
      include: { items: true },
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
          productoNombre: i.nombreProducto,
          ...(i.notas !== null && { notas: i.notas }),
        })),
      }))
    );
  } catch (err) {
    next(err);
  }
}
