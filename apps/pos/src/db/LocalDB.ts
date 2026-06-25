import type { CategoriaLocal, ProductoLocal, PedidoLocal } from "./types.js";

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
  /** Devuelve todos los pedidos con sincronizado === false. */
  getPedidosPendientesSync(): Promise<PedidoLocal[]>;
  /** Marca como sincronizados los pedidos cuyos IDs se reciben. */
  marcarSincronizados(ids: string[]): Promise<void>;
}
