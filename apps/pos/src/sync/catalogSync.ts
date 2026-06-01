import { getDB, setConfig, getConfig } from "../db/index.js";
import { apiFetch } from "../lib/api.js";
import type { CategoriaLocal, ProductoLocal } from "../db/schema.js";

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

  const db = await getDB();
  const tx = db.transaction(["categorias", "productos", "config"], "readwrite");

  // Limpiar y repoblar categorías
  await tx.objectStore("categorias").clear();
  for (const cat of data.categorias) {
    await tx.objectStore("categorias").put(cat);
  }

  // Limpiar y repoblar productos
  await tx.objectStore("productos").clear();
  for (const prod of data.productos) {
    await tx.objectStore("productos").put(prod);
  }

  await tx.done;
  await setConfig("catalog_synced_at", data.syncedAt);
  await setConfig("sucursal_id", data.sucursalId);
  await setConfig("sucursal_nombre", data.sucursalNombre);
  await setConfig("dispositivo_id", data.dispositivoId);
}

export async function getLastSyncTime(): Promise<string | null> {
  return getConfig("catalog_synced_at");
}

export async function getCatalogFromDB(): Promise<{
  categorias: CategoriaLocal[];
  productos: ProductoLocal[];
}> {
  const db = await getDB();
  const [categorias, productos] = await Promise.all([
    db.getAllFromIndex("categorias", "por_orden"),
    db.getAllFromIndex("productos", "por_orden"),
  ]);
  return { categorias, productos };
}
