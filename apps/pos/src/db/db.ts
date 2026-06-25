import { SQLiteLocalDB } from "./impl/SQLiteLocalDB.js";
import type { LocalDB } from "./LocalDB.js";

let instance: LocalDB | null = null;

export async function getLocalDB(): Promise<LocalDB> {
  if (!instance) {
    const db = new SQLiteLocalDB();
    await db.init();
    instance = db;
  }
  return instance;
}

/** Solo para tests: reemplaza la instancia con una DB ya inicializada. */
export function _setLocalDB(db: LocalDB): void {
  instance = db;
}

/** Solo para tests: resetea el singleton. */
export function _resetLocalDB(): void {
  instance = null;
}
