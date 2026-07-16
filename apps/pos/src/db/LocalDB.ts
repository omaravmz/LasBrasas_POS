import type {
  CategoriaLocal,
  ProductoLocal,
  PedidoLocal,
  AperturaLocal,
  MovimientoLocal,
  CierreLocal,
} from "./types.js";

/**
 * Contrato de la capa de persistencia local del POS.
 * Los consumidores dependen de esta interfaz, no de la implementación concreta
 * (IndexedDB hoy, SQLite cuando el puente nativo esté disponible).
 */
export interface LocalDB {
  // --- Config key-value ---
  getConfig(clave: string): Promise<string | null>;
  setConfig(clave: string, valor: string): Promise<void>;

  // --- Catálogo ---
  /** Reemplaza por completo el catálogo local (limpia y repuebla en una transacción). */
  guardarCatalogo(categorias: CategoriaLocal[], productos: ProductoLocal[]): Promise<void>;
  getCategorias(): Promise<CategoriaLocal[]>;
  getProductos(): Promise<ProductoLocal[]>;

  // --- Pedidos ---
  guardarPedido(pedido: PedidoLocal): Promise<void>;
  /**
   * Pedidos pendientes de sincronizar, EN ORDEN CRONOLÓGICO (el más viejo primero).
   *
   * El orden no es cosmético: la cola se drena en FIFO y una operación que falla
   * bloquea a las que dependen de ella. Ver DISENO_BLOQUE1.md §9.
   *
   * Excluye los que quedaron marcados con `errorSync`: esos no se reintentan, esperan
   * intervención humana. Pero NO se borran de la base.
   */
  getPedidosPendientesSync(): Promise<PedidoLocal[]>;
  /** Marca como sincronizados los pedidos cuyos IDs se reciben. */
  marcarSincronizados(ids: string[]): Promise<void>;
  /**
   * Marca un pedido como fallido de forma definitiva. No se reintentará solo.
   * El pedido permanece en la base: la venta ocurrió y el dinero está en el cajón.
   */
  marcarErrorSync(id: string, motivo: string): Promise<void>;
  /** Pedidos que el servidor rechazó de forma definitiva y esperan resolución manual. */
  getPedidosConError(): Promise<PedidoLocal[]>;
  /**
   * Folio más alto emitido en un día de operación ("YYYY-MM-DD"), o 0 si no hay ninguno.
   * Es la fuente del contador de folios: se deriva de los datos, no de un contador
   * paralelo que puede desincronizarse. Ver BD-03.
   */
  getMaxFolio(fechaOperativa: string): Promise<number>;
  /** Todos los pedidos de un día de operación. Base del cálculo de ventas offline. */
  getPedidosPorDia(fechaOperativa: string): Promise<PedidoLocal[]>;

  // --- Caja (BD-19) ---
  // Abrir el día, registrar movimientos y cerrar deben funcionar sin internet.

  guardarApertura(apertura: AperturaLocal): Promise<void>;
  getApertura(fechaOperativa: string): Promise<AperturaLocal | null>;
  getAperturasPendientesSync(): Promise<AperturaLocal[]>;

  guardarMovimiento(movimiento: MovimientoLocal): Promise<void>;
  /** Movimientos vigentes del día (excluye los marcados como eliminados). */
  getMovimientos(fechaOperativa: string): Promise<MovimientoLocal[]>;
  /** Marca un movimiento para borrado. La fila sobrevive hasta confirmarlo con el servidor. */
  marcarMovimientoEliminado(id: string): Promise<void>;
  /** Quita definitivamente la fila, una vez que el servidor confirmó el borrado. */
  purgarMovimiento(id: string): Promise<void>;
  getMovimientosPendientesSync(): Promise<MovimientoLocal[]>;
  getMovimientosEliminadosPendientes(): Promise<MovimientoLocal[]>;

  guardarCierre(cierre: CierreLocal): Promise<void>;
  getCierre(fechaOperativa: string): Promise<CierreLocal | null>;
  getCierresPendientesSync(): Promise<CierreLocal[]>;

  marcarCajaSincronizada(tabla: "apertura" | "movimiento" | "cierre", id: string): Promise<void>;
}
