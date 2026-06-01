import { getDB } from "../db/index.js";
import { apiFetch } from "../lib/api.js";
import type { PedidoLocal } from "../db/schema.js";

export async function guardarPedido(pedido: PedidoLocal): Promise<void> {
  const db = await getDB();
  await db.put("pedidos", pedido);
}

// Best-effort: si falla (offline o error), el pedido queda en IndexedDB para
// ser sincronizado en M1.4 cuando haya reconexión
export async function sincronizarPedido(pedido: PedidoLocal): Promise<void> {
  try {
    await apiFetch<unknown>("/pedidos", {
      method: "POST",
      body: JSON.stringify({
        id: pedido.id,
        folio: pedido.folio,
        origen: pedido.origen,
        metodoPago: pedido.metodoPago,
        total: pedido.total,
        notas: pedido.notas,
        items: pedido.items,
      }),
    });
    const db = await getDB();
    await db.put("pedidos", { ...pedido, sincronizado: true });
  } catch {
    // Offline o error de red — se reintentará en M1.4
  }
}
