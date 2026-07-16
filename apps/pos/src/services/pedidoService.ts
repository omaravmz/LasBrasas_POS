import { getLocalDB } from "../db/db.js";
import type { PedidoLocal } from "../db/types.js";

export async function guardarPedido(pedido: PedidoLocal): Promise<void> {
  const db = await getLocalDB();
  await db.guardarPedido(pedido);
}

// Ya no existe un `sincronizarPedido` que envíe UN pedido suelto: la sincronización pasa
// siempre por la cola completa (`sync/colaSync.ts`), que respeta el orden
// apertura → pedidos → movimientos → cierre. Enviar un pedido por su cuenta se saltaría
// la apertura y el servidor lo rechazaría con DIA_NO_ABIERTO.

export function buildPayload(pedido: PedidoLocal) {
  return {
    id: pedido.id,
    folio: pedido.folio,
    // El día de operación viaja explícito: el servidor NO lo deriva del momento en que
    // recibe el pedido, porque un pedido sincronizado de madrugada caería en el día
    // equivocado. Ver BD-02.
    fechaOperativa: pedido.fechaOperativa,
    // Con qué versión del catálogo se cotizó. Le permite al servidor distinguir un
    // precio mal calculado de un precio legítimamente viejo. Ver BD-04.
    catalogoVersion: pedido.catalogoVersion,
    origen: pedido.origen,
    metodoPago: pedido.metodoPago,
    total: pedido.total,
    ...(pedido.clienteId !== undefined && { clienteId: pedido.clienteId }),
    ...(pedido.notas !== undefined && { notas: pedido.notas }),
    ...(pedido.horaRecoleccion !== undefined && { horaRecoleccion: pedido.horaRecoleccion }),
    items: pedido.items,
  };
}
