import { apiFetch } from "../lib/api.js";
import type { ItemBorrador } from "../types/pedido.js";
import type { MetodoPago, OrigenPedido } from "@brasas/shared";

export type TipoEntrega = "MOSTRADOR" | "RECOGER" | "DOMICILIO";

export interface DatosImpresion {
  folio: number;
  sucursal: string;
  fecha: string; // ISO string
  origen: OrigenPedido;
  lineas: {
    cantidad: number;
    nombre: string;
    precioUnitario: number;
    subtotal: number;
    notas?: string;
    cortes?: { nombre: string; proporcion: number }[];
  }[];
  total: number;
  metodoPago: MetodoPago;
  notas?: string;
  tipoEntrega?: TipoEntrega;
  nombreRecoger?: string;
  horaRecoger?: string;
  direccionEntrega?: string;
  referenciaEntrega?: string;
}

// Interfaz que el puente Kotlin expone en window (M1.1 Parte B)
interface BrasasPrintBridge {
  imprimir(datosJson: string): void;
}

declare global {
  interface Window {
    BrasasPrint?: BrasasPrintBridge;
  }
}

export function buildDatosImpresion(
  items: ItemBorrador[],
  folio: number,
  sucursal: string,
  origen: OrigenPedido,
  metodoPago: MetodoPago,
  notas?: string,
  tipoEntrega?: TipoEntrega,
  nombreRecoger?: string,
  horaRecoger?: string,
  direccionEntrega?: string,
  referenciaEntrega?: string,
): DatosImpresion {
  const lineas: DatosImpresion["lineas"] = items.map((item) => {
    const linea: DatosImpresion["lineas"][number] = {
      cantidad: item.cantidad,
      nombre: item.producto.nombre,
      precioUnitario: item.producto.precio,
      subtotal: item.producto.precio * item.cantidad,
    };
    if (item.notas) linea.notas = item.notas;
    if (item.cortes.length > 0) {
      linea.cortes = item.cortes.map((c) => ({
        nombre: c.variante.nombre,
        proporcion: c.proporcion,
      }));
    }
    return linea;
  });

  const datos: DatosImpresion = {
    folio,
    sucursal,
    fecha: new Date().toISOString(),
    origen,
    metodoPago,
    total: items.reduce((s, i) => s + i.producto.precio * i.cantidad, 0),
    lineas,
  };
  if (notas !== undefined) datos.notas = notas;
  if (tipoEntrega !== undefined) datos.tipoEntrega = tipoEntrega;
  if (nombreRecoger !== undefined) datos.nombreRecoger = nombreRecoger;
  if (horaRecoger !== undefined) datos.horaRecoger = horaRecoger;
  if (direccionEntrega !== undefined) datos.direccionEntrega = direccionEntrega;
  if (referenciaEntrega !== undefined) datos.referenciaEntrega = referenciaEntrega;

  return datos;
}

export async function dispararImpresion(datos: DatosImpresion): Promise<void> {
  if (window.BrasasPrint) {
    // Producción: puente WebView → Kotlin → impresora térmica
    window.BrasasPrint.imprimir(JSON.stringify(datos));
    return;
  }

  // Desarrollo: generar PDFs en el servidor para validación visual
  try {
    await apiFetch<unknown>("/dev/imprimir", {
      method: "POST",
      body: JSON.stringify(datos),
    });
  } catch {
    // En entorno sin backend (tests de UI puros) se ignora
    console.debug("[print] Dev backend no disponible; sin PDFs generados");
  }
}
