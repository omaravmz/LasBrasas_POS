import { getLocalDB } from "../db/db.js";
import { apiFetch } from "../lib/api.js";
import type { PedidoLocal } from "../db/types.js";

export async function guardarPedido(pedido: PedidoLocal): Promise<void> {
  const db = await getLocalDB();
  await db.guardarPedido(pedido);
}

export async function sincronizarPedido(pedido: PedidoLocal): Promise<void> {
  try {
    const resultado = await apiFetch<{ sincronizados: string[]; errores: unknown[] }>(
      "/sync/pedidos",
      {
        method: "POST",
        body: JSON.stringify({ pedidos: [buildPayload(pedido)] }),
      },
    );
    if (resultado.sincronizados.includes(pedido.id)) {
      const db = await getLocalDB();
      await db.marcarSincronizados([pedido.id]);
    }
  } catch {
    // Offline o error de red — se reintentará al reconectar
  }
}

export function buildPayload(pedido: PedidoLocal) {
  return {
    id: pedido.id,
    folio: pedido.folio,
    origen: pedido.origen,
    metodoPago: pedido.metodoPago,
    total: pedido.total,
    ...(pedido.clienteId !== undefined && { clienteId: pedido.clienteId }),
    ...(pedido.notas !== undefined && { notas: pedido.notas }),
    items: pedido.items,
  };
}
