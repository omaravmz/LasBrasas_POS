import type {
  EstadoPedido,
  MetodoPago,
  OrigenPedido,
  TipoMovimientoCaja,
} from "@brasas/shared";

export interface CategoriaLocal {
  id: string;
  nombre: string;
  orden: number;
}

export interface VarianteLocal {
  id: string;
  nombre: string;
  // Grupo de corte al que pertenece. Solo los cortes de carne lo tienen; los aderezos y
  // tamaños de bebida son undefined. Antes era `grupoPrecio: number` (1 o 2) — un número
  // mágico sin dominio. Ver BD-13.
  grupoCorteId?: string;
  activo: boolean;
}

// Grupo de cortes de carne. Los de un mismo grupo comparten precio y se pueden mezclar
// entre sí (RN-01); los de grupos distintos, no.
export interface GrupoCorteLocal {
  id: string;
  nombre: string;
  orden: number;
}

export interface PrecioGrupoLocal {
  grupoCorteId: string;
  precio: number;
}

export interface ProductoLocal {
  id: string;
  categoriaId: string;
  nombre: string;
  descripcion?: string;

  // Precio de los productos SIN corte. Para los que llevan corte (`requiereCorte`), el
  // precio depende del grupo elegido y sale de `preciosPorGrupo`. Ver BD-13.
  precio: number;

  activo: boolean;
  requiereCorte: boolean;
  gramosBase?: number;
  orden: number;
  variantes: VarianteLocal[];
  preciosPorGrupo: PrecioGrupoLocal[];
}

export interface PedidoLocal {
  id: string;
  folio: number;
  sucursalId: string;
  clienteId?: string;

  // Día de operación al que pertenece la venta ("YYYY-MM-DD", hora de Mazatlán).
  // Lo estampa la terminal al cobrar. NO es lo mismo que la fecha de `creadoEn`: si el
  // pedido se sincroniza de madrugada, `creadoEn` (UTC) puede caer en otro día, pero la
  // venta pertenece a esta jornada. Ver BD-02.
  fechaOperativa: string;

  // Versión del catálogo con la que se cotizó. Permite al servidor distinguir un precio
  // mal calculado de un precio legítimamente viejo (venta offline). Ver BD-04.
  catalogoVersion: number;

  origen: OrigenPedido;
  estado: EstadoPedido;
  metodoPago?: MetodoPago;
  total: number;
  notas?: string;
  horaRecoleccion?: string;
  creadoEn: string;
  actualizadoEn: string;
  items: ItemPedidoLocal[];
  sincronizado: boolean;

  // Motivo por el que el servidor rechazó este pedido de forma definitiva. Cuando está
  // presente, el pedido NO se reintenta: necesita que una persona lo resuelva. Nunca se
  // borra de la cola — la venta ocurrió y el dinero está en el cajón. Ver BD-05 / §1.
  errorSync?: string;
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
// Caja (BD-19)
//
// La caja vive en la base local, igual que los pedidos: abrir el día, registrar entradas
// y gastos, y cerrar deben funcionar SIN INTERNET. CONTEXT.md §2.1.1 siempre lo dijo; el
// código no lo cumplía (leía el estado del API).
//
// Todas llevan `fechaOperativa`: la jornada a la que pertenece la operación. No se deriva
// del momento en que se sincroniza — si la terminal estuvo offline, ese momento puede caer
// en otro día.
// ---------------------------------------------------------------------------

export interface AperturaLocal {
  id: string;
  fechaOperativa: string;
  fondoInicial: number;
  notas?: string;
  abiertoEn: string;
  sincronizado: boolean;
}

export interface MovimientoLocal {
  id: string;
  fechaOperativa: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
  creadoEn: string;
  sincronizado: boolean;
  // Borrado local pendiente de propagar. No se elimina la fila hasta confirmarlo con el
  // servidor: si se borrara de inmediato y el DELETE fallara, el movimiento reviviría en
  // la nube y el corte de caja no cuadraría.
  eliminado: boolean;
}

// Cierre calculado y firmado por la terminal. Guarda el snapshot de lo que se IMPRIMIÓ:
// el ticket de corte que el encargado tiene en la mano tiene que poder reproducirse
// exactamente, aunque el pedido de alguna venta se haya quedado sin sincronizar.
export interface CierreLocal {
  id: string;
  fechaOperativa: string;
  fondoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  reembolsosEfectivo: number;
  totalEntradas: number;
  totalGastos: number;
  // Efectivo que el sistema espera en el cajón (referencia). El conteo físico y la
  // diferencia se hacen FUERA del sistema y no se registran aquí.
  esperadoEnCaja: number;
  // Desglose congelado al momento de cerrar. El ticket de corte los lista uno por uno,
  // y tiene que poder reimprimirse idéntico aunque después se toque algo.
  entradas: LineaMovimientoCierre[];
  gastos: LineaMovimientoCierre[];
  notas?: string;
  cerradoEn: string;
  sincronizado: boolean;
}

export interface LineaMovimientoCierre {
  id: string;
  concepto: string;
  monto: number;
}
