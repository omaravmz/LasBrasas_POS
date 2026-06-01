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
