import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { obtenerCatalogoVersion } from "../services/catalogo.js";

export async function getCatalogo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const catalogoVersion = await obtenerCatalogoVersion();

    const [categorias, productos, gruposCorte] = await Promise.all([
      prisma.categoria.findMany({
        // BD-16: una categoría dada de baja deja de aparecer en el POS. Antes no se podía
        // ni borrar (las FK están en RESTRICT) ni ocultar: quedaba atrapada para siempre.
        where: { activo: true },
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
              grupoCorteId: true,
              activo: true,
            },
          },
          // Precio del paquete SEGÚN el grupo de corte elegido. Los paquetes de carne no
          // cuestan lo mismo con Rib Eye que con Sirloin, y el sobreprecio depende del
          // paquete. Ver BD-13.
          preciosPorGrupo: {
            select: { grupoCorteId: true, precio: true },
          },
        },
      }),
      prisma.grupoCorte.findMany({
        orderBy: { orden: "asc" },
        select: { id: true, nombre: true, orden: true },
      }),
    ]);

    res.json({
      categorias,
      gruposCorte,
      productos: productos.map((p) => ({
        ...p,
        precio: Number(p.precio),
        preciosPorGrupo: p.preciosPorGrupo.map((pg) => ({
          grupoCorteId: pg.grupoCorteId,
          precio: Number(pg.precio),
        })),
      })),
      // La terminal guarda esta versión y la reenvía con cada pedido. Es lo que permite
      // al servidor distinguir un precio mal calculado de un precio legítimamente viejo
      // (venta hecha offline antes de un cambio de catálogo). Ver BD-04.
      catalogoVersion,
      sucursalId: req.dispositivo!.sucursalId,
      sucursalNombre: req.dispositivo!.sucursal.nombre,
      dispositivoId: req.dispositivo!.id,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
