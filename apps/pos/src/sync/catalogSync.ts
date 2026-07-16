import { getLocalDB } from "../db/db.js";
import { apiFetch } from "../lib/api.js";
import type { CategoriaLocal, ProductoLocal, GrupoCorteLocal } from "../db/types.js";

interface CatalogResponse {
  categorias: CategoriaLocal[];
  productos: ProductoLocal[];
  gruposCorte: GrupoCorteLocal[];
  catalogoVersion: number;
  sucursalId: string;
  sucursalNombre: string;
  dispositivoId: string;
  syncedAt: string;
}

export async function syncCatalog(): Promise<void> {
  const data = await apiFetch<CatalogResponse>("/catalog");
  const db = await getLocalDB();

  await db.guardarCatalogo(data.categorias, data.productos);
  await db.setConfig("grupos_corte", JSON.stringify(data.gruposCorte));
  await db.setConfig("catalogo_version", String(data.catalogoVersion));
  await db.setConfig("catalog_synced_at", data.syncedAt);
  await db.setConfig("sucursal_id", data.sucursalId);
  await db.setConfig("sucursal_nombre", data.sucursalNombre);
  await db.setConfig("dispositivo_id", data.dispositivoId);
}

// Versión del catálogo con el que la terminal está cotizando ahora mismo. Se guarda con
// cada pedido para que el servidor pueda distinguir un precio erróneo de un precio
// legítimamente viejo (venta hecha offline antes de un cambio de precio). Ver BD-04.
//
// 0 significa "todavía no he sincronizado el catálogo": el servidor lo tratará como
// desactualizado, que es exactamente lo correcto — no podemos afirmar que los precios
// estén al día si nunca hemos hablado con el servidor.
export async function getCatalogoVersion(): Promise<number> {
  const db = await getLocalDB();
  const raw = await db.getConfig("catalogo_version");

  if (raw === null) return 0;

  const version = Number.parseInt(raw, 10);
  return Number.isFinite(version) ? version : 0;
}

export async function getLastSyncTime(): Promise<string | null> {
  const db = await getLocalDB();
  return db.getConfig("catalog_synced_at");
}

export async function getCatalogFromDB(): Promise<{
  categorias: CategoriaLocal[];
  productos: ProductoLocal[];
  gruposCorte: GrupoCorteLocal[];
}> {
  const db = await getLocalDB();
  const [categorias, productos, gruposRaw] = await Promise.all([
    db.getCategorias(),
    db.getProductos(),
    db.getConfig("grupos_corte"),
  ]);

  const gruposCorte: GrupoCorteLocal[] = gruposRaw
    ? (JSON.parse(gruposRaw) as GrupoCorteLocal[])
    : [];

  return { categorias, productos, gruposCorte };
}
