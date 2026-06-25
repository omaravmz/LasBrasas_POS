import { prisma } from "../lib/prisma.js";
import { crearPedido, type CrearPedidoInput } from "./pedido.js";

export type PedidoSyncInput = Omit<CrearPedidoInput, "sucursalId" | "dispositivoId">;

export interface ResultadoSync {
  sincronizados: string[];
  errores: { id: string; error: string }[];
}

// Idempotente: si el pedido ya existe por su UUID, se considera sincronizado y se omite.
export async function sincronizarPedidosLote(
  pedidos: PedidoSyncInput[],
  sucursalId: string,
  dispositivoId: string
): Promise<ResultadoSync> {
  const sincronizados: string[] = [];
  const errores: { id: string; error: string }[] = [];

  for (const pedido of pedidos) {
    try {
      const existe = await prisma.pedido.findUnique({
        where: { id: pedido.id },
        select: { id: true },
      });

      if (!existe) {
        await crearPedido({ ...pedido, sucursalId, dispositivoId });
      }

      sincronizados.push(pedido.id);
    } catch (err) {
      errores.push({
        id: pedido.id,
        error: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return { sincronizados, errores };
}
