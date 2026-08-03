import type { MetodoPago, OrigenPedido } from "@prisma/client";

export interface LineaTicket {
  cantidad: number;
  nombre: string;
  precioUnitario: number;
  subtotal: number;
  notas?: string;
  // Para paquetes de carne: cortes con su proporción
  cortes?: { nombre: string; proporcion: number }[];
}

export interface DatosTicket {
  folio: number;
  sucursal: string;
  fecha: Date;
  origen: OrigenPedido;
  lineas: LineaTicket[];
  total: number;
  metodoPago: MetodoPago;
  notas?: string;
}

export interface PedidoCierre {
  folio: number;
  total: number;
  metodoPago: MetodoPago | null;
  cancelado: boolean;
}

export interface MovimientoCierre {
  concepto: string;
  monto: number;
}

// Datos del ticket de corte. Lo emite tanto el CIERRE del turno como un CORTE de control
// a media jornada (RN-23): mismo cálculo, misma plantilla. Ver CONTEXT.md §7.7.
export interface DatosTicketCierre {
  sucursal: string;
  fecha: string; // YYYY-MM-DD (fecha local Mazatlán)
  // Momento de emisión: hora del cierre, o del corte parcial si `parcial` es true.
  cerradoEn: Date;
  // true = el turno sigue abierto y estos números pueden cambiar. Se imprime bien visible
  // para que un corte parcial no se confunda con el corte definitivo del día.
  parcial?: boolean;
  fondoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  numPedidos: number;
  pedidos: PedidoCierre[];
  entradas: MovimientoCierre[];
  gastos: MovimientoCierre[];
  reembolsosEfectivo: number;
  esperadoEnCaja: number;
  notas?: string;
}

export interface DatosContacto {
  sucursalPraderaDorada: string;
  sucursalVillasDelRio: string;
  whatsapp: string;
  instagram: string;
  emailFacturacion?: string;
}

export const CONTACTO: DatosContacto = {
  sucursalPraderaDorada: "667-482-2244",
  sucursalVillasDelRio: "667-257-5757",
  whatsapp: "667-176-0101",
  instagram: "@lasbrasascln",
  // emailFacturacion: pendiente de confirmar con el negocio
};
