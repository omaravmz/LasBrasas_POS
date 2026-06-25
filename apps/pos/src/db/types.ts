import type { EstadoPedido, MetodoPago, OrigenPedido } from "@brasas/shared";

export interface CategoriaLocal {
  id: string;
  nombre: string;
  orden: number;
}

export interface VarianteLocal {
  id: string;
  nombre: string;
  grupoPrecio?: number;
  activo: boolean;
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

export interface PedidoLocal {
  id: string;
  folio: number;
  sucursalId: string;
  clienteId?: string;
  origen: OrigenPedido;
  estado: EstadoPedido;
  metodoPago?: MetodoPago;
  total: number;
  notas?: string;
  creadoEn: string;
  actualizadoEn: string;
  items: ItemPedidoLocal[];
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
