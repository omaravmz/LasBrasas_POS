import initSqlJs, { type Database } from "sql.js";
// ?url resuelto por Vite en browser; en Node (tests) sql.js halla el WASM solo.
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { LocalDB } from "../LocalDB.js";
import type { CategoriaLocal, ProductoLocal, PedidoLocal } from "../types.js";

const OPFS_FILE = "brasas-pos.sqlite3";

async function cargarDesdeOPFS(): Promise<Uint8Array | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(OPFS_FILE);
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function persistirEnOPFS(db: Database): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(OPFS_FILE, { create: true });
    const writable = await fh.createWritable();
    // db.export() retorna Uint8Array<ArrayBufferLike>; copiamos a un buffer plain
    // para satisfacer la firma de FileSystemWritableFileStream.write().
    const raw = db.export();
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    await writable.write(new Blob([copy]));
    await writable.close();
  } catch {
    // No-op en entornos sin OPFS (dev browser sin headers, tests Node)
  }
}

export class SQLiteLocalDB implements LocalDB {
  private db!: Database;

  async init(): Promise<void> {
    const isBrowser = typeof window !== "undefined";
    const SQL = await initSqlJs(isBrowser ? { locateFile: () => wasmUrl } : {});

    const saved = await cargarDesdeOPFS();
    this.db = saved ? new SQL.Database(saved) : new SQL.Database();

    this.db.run(`
      CREATE TABLE IF NOT EXISTS config (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS categorias (
        id     TEXT    PRIMARY KEY,
        nombre TEXT    NOT NULL,
        orden  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS productos (
        id    TEXT    PRIMARY KEY,
        orden INTEGER NOT NULL,
        data  TEXT    NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pedidos (
        id           TEXT    PRIMARY KEY,
        data         TEXT    NOT NULL,
        sincronizado INTEGER NOT NULL DEFAULT 0
      );
    `);

    await persistirEnOPFS(this.db);
  }

  private async persistir(): Promise<void> {
    await persistirEnOPFS(this.db);
  }

  // ---- Config ---------------------------------------------------------------

  async getConfig(clave: string): Promise<string | null> {
    const res = this.db.exec("SELECT valor FROM config WHERE clave = ?", [clave]);
    return (res[0]?.values[0]?.[0] as string | undefined) ?? null;
  }

  async setConfig(clave: string, valor: string): Promise<void> {
    this.db.run("INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)", [clave, valor]);
    await this.persistir();
  }

  // ---- Catálogo -------------------------------------------------------------

  async guardarCatalogo(categorias: CategoriaLocal[], productos: ProductoLocal[]): Promise<void> {
    this.db.run("DELETE FROM categorias");
    this.db.run("DELETE FROM productos");

    for (const cat of categorias) {
      this.db.run(
        "INSERT INTO categorias (id, nombre, orden) VALUES (?, ?, ?)",
        [cat.id, cat.nombre, cat.orden],
      );
    }

    for (const prod of productos) {
      this.db.run(
        "INSERT INTO productos (id, orden, data) VALUES (?, ?, ?)",
        [prod.id, prod.orden, JSON.stringify(prod)],
      );
    }

    await this.persistir();
  }

  async getCategorias(): Promise<CategoriaLocal[]> {
    const res = this.db.exec("SELECT id, nombre, orden FROM categorias ORDER BY orden");
    if (!res[0]) return [];
    return res[0].values.map(([id, nombre, orden]) => ({
      id: id as string,
      nombre: nombre as string,
      orden: orden as number,
    }));
  }

  async getProductos(): Promise<ProductoLocal[]> {
    const res = this.db.exec("SELECT data FROM productos ORDER BY orden");
    if (!res[0]) return [];
    return res[0].values.map(([data]) => JSON.parse(data as string) as ProductoLocal);
  }

  // ---- Pedidos --------------------------------------------------------------

  async guardarPedido(pedido: PedidoLocal): Promise<void> {
    this.db.run(
      "INSERT OR REPLACE INTO pedidos (id, data, sincronizado) VALUES (?, ?, ?)",
      [pedido.id, JSON.stringify(pedido), pedido.sincronizado ? 1 : 0],
    );
    await this.persistir();
  }

  async getPedidosPendientesSync(): Promise<PedidoLocal[]> {
    const res = this.db.exec("SELECT data FROM pedidos WHERE sincronizado = 0");
    if (!res[0]) return [];
    return res[0].values.map(([data]) => JSON.parse(data as string) as PedidoLocal);
  }

  async marcarSincronizados(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      const res = this.db.exec("SELECT data FROM pedidos WHERE id = ?", [id]);
      if (!res[0]?.values[0]) continue;
      const pedido = JSON.parse(res[0].values[0][0] as string) as PedidoLocal;
      pedido.sincronizado = true;
      this.db.run(
        "UPDATE pedidos SET data = ?, sincronizado = 1 WHERE id = ?",
        [JSON.stringify(pedido), id],
      );
    }
    await this.persistir();
  }
}
