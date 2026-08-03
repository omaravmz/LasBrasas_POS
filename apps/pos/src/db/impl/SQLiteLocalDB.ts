import initSqlJs, { type Database } from "sql.js";
// ?url resuelto por Vite en browser; en Node (tests) sql.js halla el WASM solo.
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { EstadoPedido } from "@brasas/shared";
import type { LocalDB } from "../LocalDB.js";
import type {
  CategoriaLocal,
  ProductoLocal,
  PedidoLocal,
  AperturaLocal,
  MovimientoLocal,
  CierreLocal,
} from "../types.js";

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

      -- Caja local (BD-19). Abrir, mover efectivo y cerrar el día funcionan sin internet.
      -- Una fila por día: la restricción UNIQUE sobre fecha_operativa hace cumplir RN-08
      -- (una sola apertura y un solo cierre por día) también en la base local.
      CREATE TABLE IF NOT EXISTS caja_apertura (
        id              TEXT    PRIMARY KEY,
        fecha_operativa TEXT    NOT NULL UNIQUE,
        data            TEXT    NOT NULL,
        sincronizado    INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS caja_movimientos (
        id              TEXT    PRIMARY KEY,
        fecha_operativa TEXT    NOT NULL,
        creado_en       TEXT    NOT NULL,
        data            TEXT    NOT NULL,
        sincronizado    INTEGER NOT NULL DEFAULT 0,
        eliminado       INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS caja_cierre (
        id              TEXT    PRIMARY KEY,
        fecha_operativa TEXT    NOT NULL UNIQUE,
        data            TEXT    NOT NULL,
        sincronizado    INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_movimientos_dia
        ON caja_movimientos(fecha_operativa, creado_en);
    `);

    this.migrar();

    await persistirEnOPFS(this.db);
  }

  // Migraciones del esquema local.
  //
  // La base local de una terminal en uso ya tiene pedidos dentro: no se puede recrear.
  // SQLite no soporta `ADD COLUMN IF NOT EXISTS`, así que se consulta el esquema actual
  // antes de alterarlo. Es idempotente: correrlo dos veces no hace nada la segunda.
  private migrar(): void {
    const columnas = new Set(
      this.db
        .exec("PRAGMA table_info(pedidos)")[0]
        ?.values.map((fila) => fila[1] as string) ?? [],
    );

    // BD-02/BD-03: el día operativo y el folio salen del blob JSON a columnas propias,
    // para poder consultarlos. `getMaxFolio` los necesita indexables; leer y parsear
    // todos los pedidos en cada cobro para calcular el folio sería absurdo.
    if (!columnas.has("fecha_operativa")) {
      this.db.run("ALTER TABLE pedidos ADD COLUMN fecha_operativa TEXT NOT NULL DEFAULT ''");
    }

    if (!columnas.has("folio")) {
      this.db.run("ALTER TABLE pedidos ADD COLUMN folio INTEGER NOT NULL DEFAULT 0");
    }

    // Orden de la cola de sincronización (FIFO). ISO-8601 ordena cronológicamente al
    // compararse como texto, así que sirve directamente para el ORDER BY.
    if (!columnas.has("creado_en")) {
      this.db.run("ALTER TABLE pedidos ADD COLUMN creado_en TEXT NOT NULL DEFAULT ''");
    }

    // Pedido rechazado en firme por el servidor: no se reintenta, espera a una persona.
    if (!columnas.has("error_sync")) {
      this.db.run("ALTER TABLE pedidos ADD COLUMN error_sync TEXT");
    }

    // Rellena las columnas nuevas de los pedidos que ya existían, leyéndolas del blob.
    const viejos = this.db.exec(
      "SELECT id, data FROM pedidos WHERE fecha_operativa = '' OR creado_en = ''",
    );

    for (const [id, data] of viejos[0]?.values ?? []) {
      const pedido = JSON.parse(data as string) as PedidoLocal;

      // Los pedidos anteriores a BD-02 no tienen fechaOperativa. Se deriva de creadoEn
      // en hora de Mazatlán, que es la mejor aproximación disponible — la misma que usa
      // el backfill del backend.
      const fecha =
        pedido.fechaOperativa ??
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mazatlan" }).format(
          new Date(pedido.creadoEn),
        );

      this.db.run(
        "UPDATE pedidos SET fecha_operativa = ?, folio = ?, creado_en = ? WHERE id = ?",
        [fecha, pedido.folio, pedido.creadoEn, id as string],
      );
    }

    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_pedidos_dia ON pedidos(fecha_operativa, folio)",
    );
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
      `INSERT OR REPLACE INTO pedidos
         (id, data, sincronizado, fecha_operativa, folio, creado_en, error_sync)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        pedido.id,
        JSON.stringify(pedido),
        pedido.sincronizado ? 1 : 0,
        pedido.fechaOperativa,
        pedido.folio,
        pedido.creadoEn,
        pedido.errorSync ?? null,
      ],
    );
    await this.persistir();
  }

  // Cola de sincronización: FIFO estricto y sin los que ya fallaron en firme.
  //
  // El ORDER BY no es un detalle: la cola se drena en orden y una operación que falla
  // detiene el lote, porque las que vienen detrás pueden depender de ella.
  async getPedidosPendientesSync(): Promise<PedidoLocal[]> {
    const res = this.db.exec(
      `SELECT data FROM pedidos
       WHERE sincronizado = 0 AND error_sync IS NULL
       ORDER BY creado_en ASC`,
    );
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
      delete pedido.errorSync;
      this.db.run(
        "UPDATE pedidos SET data = ?, sincronizado = 1, error_sync = NULL WHERE id = ?",
        [JSON.stringify(pedido), id],
      );
    }
    await this.persistir();
  }

  // El pedido se queda en la base. Nunca se borra: la venta ocurrió, el cliente pagó y
  // el dinero está en el cajón. Lo único que cambia es que deja de reintentarse solo.
  async marcarErrorSync(id: string, motivo: string): Promise<void> {
    const res = this.db.exec("SELECT data FROM pedidos WHERE id = ?", [id]);
    if (!res[0]?.values[0]) return;

    const pedido = JSON.parse(res[0].values[0][0] as string) as PedidoLocal;
    pedido.errorSync = motivo;

    this.db.run("UPDATE pedidos SET data = ?, error_sync = ? WHERE id = ?", [
      JSON.stringify(pedido),
      motivo,
      id,
    ]);
    await this.persistir();
  }

  async getPedidosConError(): Promise<PedidoLocal[]> {
    const res = this.db.exec(
      "SELECT data FROM pedidos WHERE error_sync IS NOT NULL ORDER BY creado_en ASC",
    );
    if (!res[0]) return [];
    return res[0].values.map(([data]) => JSON.parse(data as string) as PedidoLocal);
  }

  // El folio sale de los datos, no de un contador aparte que puede desviarse de ellos.
  async getMaxFolio(fechaOperativa: string): Promise<number> {
    const res = this.db.exec(
      "SELECT MAX(folio) FROM pedidos WHERE fecha_operativa = ?",
      [fechaOperativa],
    );

    const max = res[0]?.values[0]?.[0];
    return typeof max === "number" ? max : 0;
  }

  async getPedidosPorDia(fechaOperativa: string): Promise<PedidoLocal[]> {
    const res = this.db.exec(
      "SELECT data FROM pedidos WHERE fecha_operativa = ? ORDER BY folio ASC",
      [fechaOperativa],
    );
    if (!res[0]) return [];
    return res[0].values.map(([data]) => JSON.parse(data as string) as PedidoLocal);
  }

  // El estado vive dentro del blob JSON. Se reescribe el blob (no las columnas indexadas:
  // id/folio/fecha no cambian al avanzar el estado). No-op si el pedido no está en local.
  async actualizarEstadoPedido(id: string, estado: EstadoPedido): Promise<void> {
    const res = this.db.exec("SELECT data FROM pedidos WHERE id = ?", [id]);
    if (!res[0]?.values[0]) return;

    const pedido = JSON.parse(res[0].values[0][0] as string) as PedidoLocal;
    pedido.estado = estado;
    pedido.actualizadoEn = new Date().toISOString();

    this.db.run("UPDATE pedidos SET data = ? WHERE id = ?", [JSON.stringify(pedido), id]);
    await this.persistir();
  }

  // ---- Caja (BD-19) ---------------------------------------------------------

  private leerUno<T>(sql: string, params: (string | number)[]): T | null {
    const res = this.db.exec(sql, params);
    const data = res[0]?.values[0]?.[0];
    return data === undefined ? null : (JSON.parse(data as string) as T);
  }

  private leerVarios<T>(sql: string, params: (string | number)[] = []): T[] {
    const res = this.db.exec(sql, params);
    if (!res[0]) return [];
    return res[0].values.map(([data]) => JSON.parse(data as string) as T);
  }

  async guardarApertura(apertura: AperturaLocal): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO caja_apertura (id, fecha_operativa, data, sincronizado)
       VALUES (?, ?, ?, ?)`,
      [
        apertura.id,
        apertura.fechaOperativa,
        JSON.stringify(apertura),
        apertura.sincronizado ? 1 : 0,
      ],
    );
    await this.persistir();
  }

  async getApertura(fechaOperativa: string): Promise<AperturaLocal | null> {
    return this.leerUno<AperturaLocal>(
      "SELECT data FROM caja_apertura WHERE fecha_operativa = ?",
      [fechaOperativa],
    );
  }

  async getAperturasPendientesSync(): Promise<AperturaLocal[]> {
    return this.leerVarios<AperturaLocal>(
      "SELECT data FROM caja_apertura WHERE sincronizado = 0 ORDER BY fecha_operativa ASC",
    );
  }

  // RN-24. La comparación de fechas es lexicográfica porque "YYYY-MM-DD" lo permite: es
  // el mismo orden que el cronológico. Nada de convertir a Date aquí.
  async getDiasSinCerrar(anteriorA: string): Promise<AperturaLocal[]> {
    return this.leerVarios<AperturaLocal>(
      `SELECT a.data FROM caja_apertura a
       LEFT JOIN caja_cierre c ON c.fecha_operativa = a.fecha_operativa
       WHERE a.fecha_operativa < ? AND c.id IS NULL
       ORDER BY a.fecha_operativa ASC`,
      [anteriorA],
    );
  }

  async guardarMovimiento(movimiento: MovimientoLocal): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO caja_movimientos
         (id, fecha_operativa, creado_en, data, sincronizado, eliminado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        movimiento.id,
        movimiento.fechaOperativa,
        movimiento.creadoEn,
        JSON.stringify(movimiento),
        movimiento.sincronizado ? 1 : 0,
        movimiento.eliminado ? 1 : 0,
      ],
    );
    await this.persistir();
  }

  async getMovimientos(fechaOperativa: string): Promise<MovimientoLocal[]> {
    return this.leerVarios<MovimientoLocal>(
      `SELECT data FROM caja_movimientos
       WHERE fecha_operativa = ? AND eliminado = 0
       ORDER BY creado_en ASC`,
      [fechaOperativa],
    );
  }

  // El movimiento NO se borra todavía. Si se eliminara aquí y el DELETE al servidor
  // fallara, el movimiento reviviría en la nube y el corte de caja dejaría de cuadrar.
  async marcarMovimientoEliminado(id: string): Promise<void> {
    const mov = this.leerUno<MovimientoLocal>(
      "SELECT data FROM caja_movimientos WHERE id = ?",
      [id],
    );
    if (!mov) return;

    mov.eliminado = true;

    this.db.run("UPDATE caja_movimientos SET data = ?, eliminado = 1 WHERE id = ?", [
      JSON.stringify(mov),
      id,
    ]);
    await this.persistir();
  }

  async purgarMovimiento(id: string): Promise<void> {
    this.db.run("DELETE FROM caja_movimientos WHERE id = ?", [id]);
    await this.persistir();
  }

  async getMovimientosPendientesSync(): Promise<MovimientoLocal[]> {
    return this.leerVarios<MovimientoLocal>(
      `SELECT data FROM caja_movimientos
       WHERE sincronizado = 0 AND eliminado = 0
       ORDER BY creado_en ASC`,
    );
  }

  // Movimientos borrados localmente que el servidor todavía tiene.
  async getMovimientosEliminadosPendientes(): Promise<MovimientoLocal[]> {
    return this.leerVarios<MovimientoLocal>(
      `SELECT data FROM caja_movimientos
       WHERE eliminado = 1 AND sincronizado = 1
       ORDER BY creado_en ASC`,
    );
  }

  async guardarCierre(cierre: CierreLocal): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO caja_cierre (id, fecha_operativa, data, sincronizado)
       VALUES (?, ?, ?, ?)`,
      [cierre.id, cierre.fechaOperativa, JSON.stringify(cierre), cierre.sincronizado ? 1 : 0],
    );
    await this.persistir();
  }

  async getCierre(fechaOperativa: string): Promise<CierreLocal | null> {
    return this.leerUno<CierreLocal>(
      "SELECT data FROM caja_cierre WHERE fecha_operativa = ?",
      [fechaOperativa],
    );
  }

  async getCierresPendientesSync(): Promise<CierreLocal[]> {
    return this.leerVarios<CierreLocal>(
      "SELECT data FROM caja_cierre WHERE sincronizado = 0 ORDER BY fecha_operativa ASC",
    );
  }

  async marcarCajaSincronizada(
    tabla: "apertura" | "movimiento" | "cierre",
    id: string,
  ): Promise<void> {
    const nombre =
      tabla === "apertura"
        ? "caja_apertura"
        : tabla === "movimiento"
          ? "caja_movimientos"
          : "caja_cierre";

    const res = this.db.exec(`SELECT data FROM ${nombre} WHERE id = ?`, [id]);
    if (!res[0]?.values[0]) return;

    const registro = JSON.parse(res[0].values[0][0] as string) as { sincronizado: boolean };
    registro.sincronizado = true;

    this.db.run(`UPDATE ${nombre} SET data = ?, sincronizado = 1 WHERE id = ?`, [
      JSON.stringify(registro),
      id,
    ]);
    await this.persistir();
  }
}
