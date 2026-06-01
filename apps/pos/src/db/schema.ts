import type { DBSchema } from "idb";
import type { EstadoPedido, MetodoPago, OrigenPedido } from "@brasas/shared";

// ---------------------------------------------------------------------------
// Tipos locales (espejo simplificado del modelo de Prisma para IndexedDB)
// ---------------------------------------------------------------------------

export interface CategoriaLocal {
  id: string;
  nombre: string;
  orden: number;
}

export interface ProductoLocal {
  id: string;
  categoriaId: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  activo: boolean;
  requiereCorte: boolean;
  gramosBase?: number;
  orden: number;
  variantes: VarianteLocal[];
}

export interface VarianteLocal {
  id: string;
  nombre: string;
  grupoPrecio?: number;
  activo: boolean;
}

export interface PedidoLocal {
  id: string;
  folio: number;
  sucursalId: string;
  origen: OrigenPedido;
  estado: EstadoPedido;
  metodoPago?: MetodoPago;
  total: number;
  notas?: string;
  creadoEn: string;
  actualizadoEn: string;
  items: ItemPedidoLocal[];
  // Control de sincronización
  sincronizado: boolean;
}

export interface ItemPedidoLocal {
  id: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  notas?: string;
  selecciones: SeleccionVarianteLocal[];
}

export interface SeleccionVarianteLocal {
  id: string;
  varianteId: string;
  proporcion: number;
}

export interface ConfigLocal {
  clave: string;
  valor: string;
}

// ---------------------------------------------------------------------------
// Schema de IndexedDB
// ---------------------------------------------------------------------------

export interface BrasasDB extends DBSchema {
  categorias: {
    key: string;
    value: CategoriaLocal;
    indexes: { por_orden: number };
  };
  productos: {
    key: string;
    value: ProductoLocal;
    indexes: { por_categoria: string; por_orden: number };
  };
  pedidos: {
    key: string;
    value: PedidoLocal;
    indexes: { por_estado: string; por_folio: number; pendientes_sync: number };
  };
  config: {
    key: string;
    value: ConfigLocal;
  };
}
