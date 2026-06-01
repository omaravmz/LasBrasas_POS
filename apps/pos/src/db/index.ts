import { openDB, type IDBPDatabase } from "idb";
import type { BrasasDB } from "./schema.js";

const DB_NAME = "brasas-pos";
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<BrasasDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<BrasasDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<BrasasDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Categorías
      const catStore = db.createObjectStore("categorias", { keyPath: "id" });
      catStore.createIndex("por_orden", "orden");

      // Productos
      const prodStore = db.createObjectStore("productos", { keyPath: "id" });
      prodStore.createIndex("por_categoria", "categoriaId");
      prodStore.createIndex("por_orden", "orden");

      // Pedidos
      const pedidoStore = db.createObjectStore("pedidos", { keyPath: "id" });
      pedidoStore.createIndex("por_estado", "estado");
      pedidoStore.createIndex("por_folio", "folio");
      pedidoStore.createIndex("pendientes_sync", "sincronizado");

      // Config
      db.createObjectStore("config", { keyPath: "clave" });
    },
  });

  return dbInstance;
}

export async function getConfig(clave: string): Promise<string | null> {
  const db = await getDB();
  const entry = await db.get("config", clave);
  return entry?.valor ?? null;
}

export async function setConfig(clave: string, valor: string): Promise<void> {
  const db = await getDB();
  await db.put("config", { clave, valor });
}
