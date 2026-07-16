import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Versión del catálogo (BD-04). Fila única, id = 1.
//
// Se incrementa en CADA escritura de catálogo: alta, baja, cambio de precio o de
// disponibilidad de un Producto, ProductoVariante o Categoria.
//
// Sirve para distinguir dos casos que producen el mismo síntoma —el precio que manda
// la terminal no coincide con el del catálogo— pero exigen respuestas opuestas:
//
//   - La terminal usó el catálogo vigente  → es un bug del POS. Rechazar.
//   - El precio cambió mientras la terminal estaba offline → la venta ya ocurrió a ese
//     precio. Aceptar y marcar.
//
// Ver DISENO_BLOQUE1.md §4.

const ID_SINGLETON = 1;

export async function obtenerCatalogoVersion(): Promise<number> {
  const fila = await prisma.catalogoVersion.findUnique({ where: { id: ID_SINGLETON } });

  if (!fila) {
    // La migración inserta la fila; si falta, la base está mal inicializada.
    throw new Error("CatalogoVersion no inicializada: falta la fila singleton (id = 1)");
  }

  return fila.version;
}

// Incrementa la versión. Debe llamarse DENTRO de la misma transacción que modifica el
// catálogo: si el catálogo cambia y la versión no, las terminales seguirán creyendo que
// su copia está al día y venderán con precios viejos sin que nada lo marque.
export async function incrementarCatalogoVersion(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const fila = await tx.catalogoVersion.update({
    where: { id: ID_SINGLETON },
    data: { version: { increment: 1 } },
  });

  return fila.version;
}
