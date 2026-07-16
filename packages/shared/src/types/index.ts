// Enums compartidos (espejo de los enums de Prisma para uso en el frontend)

export enum RolUsuario {
  DUENO = "DUENO",
  ADMIN = "ADMIN",
}

export enum OrigenPedido {
  MOSTRADOR = "MOSTRADOR",
  TELEFONO = "TELEFONO",
  WHATSAPP = "WHATSAPP",
  DELIVERY = "DELIVERY",
}

export enum EstadoPedido {
  PENDIENTE = "PENDIENTE",
  LISTO = "LISTO",
  ENTREGADO = "ENTREGADO",
  CANCELADO = "CANCELADO",
}

export enum MetodoPago {
  EFECTIVO = "EFECTIVO",
  TARJETA = "TARJETA",
  TRANSFERENCIA = "TRANSFERENCIA",
}

export enum EstadoTraslado {
  PENDIENTE = "PENDIENTE",
  CONFIRMADO = "CONFIRMADO",
  CANCELADO = "CANCELADO",
}

export enum Unidad {
  KG = "KG",
  GR = "GR",
  LT = "LT",
  ML = "ML",
  PIEZA = "PIEZA",
}

export enum TipoInsumo {
  CARNE = "CARNE",
  POLLO = "POLLO",
  CONSUMIBLE = "CONSUMIBLE",
  BEBIDA = "BEBIDA",
  COMPLEMENTO = "COMPLEMENTO",
}

export enum TipoMovimientoCaja {
  ENTRADA = "ENTRADA",
  GASTO = "GASTO",
}

// Respuesta de error estructurada del backend
export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

// Códigos de error que el POS debe saber distinguir para decidir qué hacer con una
// operación encolada. Ver DISENO_BLOQUE1.md §6.
export const CodigoError = {
  // El build de la app es anterior a la versión mínima que acepta el backend.
  // → Bloquear sincronización, NO la venta. NO descartar la cola.
  CLIENTE_DESACTUALIZADO: "CLIENTE_DESACTUALIZADO",

  // No existe AperturaDia para la fechaOperativa del pedido.
  // → Reintentar: probablemente la apertura aún no ha sincronizado (la cola es FIFO).
  DIA_NO_ABIERTO: "DIA_NO_ABIERTO",

  // Ya existe CierreDia para esa fecha. Un pedido no puede entrar a un día cerrado.
  // → NO reintentar. Escalar al encargado para resolución manual.
  DIA_YA_CERRADO: "DIA_YA_CERRADO",

  // Otro pedido distinto ya usó ese folio ese día. El contador local se desincronizó.
  // → NO reintentar tal cual. Escalar al encargado.
  FOLIO_DUPLICADO: "FOLIO_DUPLICADO",

  // total ≠ Σ(precioUnitario × cantidad). Bug de cálculo en el POS.
  TOTAL_INCONSISTENTE: "TOTAL_INCONSISTENTE",

  // El catálogo está al día y aun así el precio no coincide con el del producto.
  PRECIO_INVALIDO: "PRECIO_INVALIDO",

  // Mismo id de pedido, contenido distinto. El POS reusó un UUID.
  CONFLICTO_IDEMPOTENCIA: "CONFLICTO_IDEMPOTENCIA",

  // El POS dice tener una versión de catálogo que el servidor no ha emitido.
  CATALOGO_INCONSISTENTE: "CATALOGO_INCONSISTENTE",
} as const;

export type CodigoError = (typeof CodigoError)[keyof typeof CodigoError];
