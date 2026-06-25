import { getLocalDB } from "../db/db.js";
import { apiFetch } from "../lib/api.js";
import { buildPayload } from "./pedidoService.js";

export async function getPendientesSinc() {
  const db = await getLocalDB();
  return db.getPedidosPendientesSync();
}

export async function sincronizarPendientes(): Promise<void> {
  const pendientes = await getPendientesSinc();
  if (pendientes.length === 0) return;

  try {
    const resultado = await apiFetch<{ sincronizados: string[]; errores: unknown[] }>(
      "/sync/pedidos",
      {
        method: "POST",
        body: JSON.stringify({ pedidos: pendientes.map(buildPayload) }),
      },
    );

    if (resultado.sincronizados.length > 0) {
      const db = await getLocalDB();
      await db.marcarSincronizados(resultado.sincronizados);
    }
  } catch {
    // Sin conexión — se reintentará en el próximo evento online
  }
}
