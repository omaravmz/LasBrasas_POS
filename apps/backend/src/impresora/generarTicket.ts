import type { DatosTicket } from "./ticket.js";
import { CONTACTO } from "./ticket.js";

// 80mm de papel térmico = ~48 caracteres por línea con fuente estándar
const ANCHO = 48;

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

function centrar(texto: string): string {
  const padding = Math.max(0, Math.floor((ANCHO - texto.length) / 2));
  return " ".repeat(padding) + texto;
}

function columnas(izquierda: string, derecha: string): string {
  const espacio = ANCHO - izquierda.length - derecha.length;
  if (espacio <= 0) return izquierda.slice(0, ANCHO - derecha.length - 1) + " " + derecha;
  return izquierda + " ".repeat(espacio) + derecha;
}

function separador(caracter = "-"): string {
  return caracter.repeat(ANCHO);
}

function formatearPrecio(monto: number): string {
  return `$${monto.toFixed(2)}`;
}

function formatearFecha(fecha: Date): string {
  return fecha.toLocaleDateString("es-MX", {
    timeZone: "America/Mazatlan",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatearHora(fecha: Date): string {
  return fecha.toLocaleTimeString("es-MX", {
    timeZone: "America/Mazatlan",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatearMetodoPago(metodo: string): string {
  const mapa: Record<string, string> = {
    EFECTIVO: "Efectivo",
    TARJETA: "Tarjeta",
    TRANSFERENCIA: "Transferencia",
  };
  return mapa[metodo] ?? metodo;
}

// ---------------------------------------------------------------------------
// Ticket cliente
// ---------------------------------------------------------------------------

export function generarTicketCliente(datos: DatosTicket): string[] {
  const lineas: string[] = [];

  // Encabezado
  lineas.push(centrar("LAS BRASAS"));
  lineas.push(centrar("Asadero Estilo Sinaloense"));
  lineas.push(separador("="));

  // Datos de contacto
  lineas.push(columnas("Pradera Dorada:", CONTACTO.sucursalPraderaDorada));
  lineas.push(columnas("Villas del Río:", CONTACTO.sucursalVillasDelRio));
  lineas.push(columnas("WhatsApp:", CONTACTO.whatsapp));
  lineas.push(columnas("Instagram:", CONTACTO.instagram));
  if (CONTACTO.emailFacturacion) {
    lineas.push(centrar(CONTACTO.emailFacturacion));
  }
  lineas.push(separador("="));

  // Folio y fecha
  lineas.push(
    columnas(
      `Folio: #${String(datos.folio).padStart(3, "0")}`,
      formatearFecha(datos.fecha)
    )
  );
  lineas.push(columnas(`Sucursal: ${datos.sucursal}`, formatearHora(datos.fecha)));
  lineas.push(separador());

  // Líneas del pedido
  for (const linea of datos.lineas) {
    const encabezadoLinea = `${linea.cantidad}x ${linea.nombre}`;
    lineas.push(columnas(encabezadoLinea, formatearPrecio(linea.subtotal)));

    // Cortes seleccionados (paquetes de carne)
    if (linea.cortes && linea.cortes.length > 0) {
      for (const corte of linea.cortes) {
        const pct = Math.round(corte.proporcion * 100);
        lineas.push(`   - ${corte.nombre}${linea.cortes.length > 1 ? ` (${pct}%)` : ""}`);
      }
    }

    // Precio unitario si la cantidad es mayor a 1
    if (linea.cantidad > 1) {
      lineas.push(`   ${formatearPrecio(linea.precioUnitario)} c/u`);
    }

    if (linea.notas) {
      lineas.push(`   * ${linea.notas}`);
    }
  }

  lineas.push(separador());

  // Total y método de pago
  lineas.push(columnas("TOTAL", formatearPrecio(datos.total)));
  lineas.push(columnas("Método de pago:", formatearMetodoPago(datos.metodoPago)));

  if (datos.notas) {
    lineas.push(separador());
    lineas.push(`Notas: ${datos.notas}`);
  }

  lineas.push(separador("="));
  lineas.push(centrar("¡Gracias por su preferencia!"));

  return lineas;
}

// ---------------------------------------------------------------------------
// Ticket de producción
// ---------------------------------------------------------------------------

export function generarTicketProduccion(datos: DatosTicket): string[] {
  const lineas: string[] = [];

  lineas.push(separador("="));
  lineas.push(centrar("PRODUCCIÓN"));
  lineas.push(separador("="));

  lineas.push(
    columnas(
      `Folio: #${String(datos.folio).padStart(3, "0")}`,
      datos.sucursal
    )
  );
  lineas.push(
    columnas(formatearFecha(datos.fecha), formatearHora(datos.fecha))
  );
  lineas.push(separador());

  for (const linea of datos.lineas) {
    lineas.push(`${linea.cantidad}x ${linea.nombre}`);

    if (linea.cortes && linea.cortes.length > 0) {
      for (const corte of linea.cortes) {
        const pct = Math.round(corte.proporcion * 100);
        lineas.push(`   - ${corte.nombre}${linea.cortes.length > 1 ? ` (${pct}%)` : ""}`);
      }
    }

    if (linea.notas) {
      lineas.push(`   * ${linea.notas}`);
    }
  }

  lineas.push(separador());
  lineas.push(centrar(datos.origen));

  if (datos.notas) {
    lineas.push(separador());
    lineas.push(`Notas: ${datos.notas}`);
  }

  lineas.push(separador("="));

  return lineas;
}
