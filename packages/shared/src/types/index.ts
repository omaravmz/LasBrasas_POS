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

// Respuesta de error estructurada del backend
export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}
