import { getLocalDB } from "../db/db.js";
import { apiFetch } from "../lib/api.js";
import type { CategoriaLocal, ProductoLocal } from "../db/types.js";

interface CatalogResponse {
  categorias: CategoriaLocal[];
  productos: ProductoLocal[];
  sucursalId: string;
  sucursalNombre: string;
  dispositivoId: string;
  syncedAt: string;
}

export async function syncCatalog(): Promise<void> {
  const data = await apiFetch<CatalogResponse>("/catalog");
  const db = await getLocalDB();

  await db.guardarCatalogo(data.categorias, data.productos);
  await db.setConfig("catalog_synced_at", data.syncedAt);
  await db.setConfig("sucursal_id", data.sucursalId);
  await db.setConfig("sucursal_nombre", data.sucursalNombre);
  await db.setConfig("dispositivo_id", data.dispositivoId);
}

export async function getLastSyncTime(): Promise<string | null> {
  const db = await getLocalDB();
  return db.getConfig("catalog_synced_at");
}

export async function getCatalogFromDB(): Promise<{
  categorias: CategoriaLocal[];
  productos: ProductoLocal[];
}> {
  const db = await getLocalDB();
  const [categorias, productos] = await Promise.all([
    db.getCategorias(),
    db.getProductos(),
  ]);
  return { categorias, productos };
}
