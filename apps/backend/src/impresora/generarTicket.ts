import type { DatosTicket, DatosTicketCierre } from "./ticket.js";
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

function formatearFechaCorta(fechaISO: string): string {
  // fechaISO viene como "YYYY-MM-DD" (fecha local de Mazatlán, sin zona)
  const partes = fechaISO.split("-");
  const anio = partes[0] ?? "";
  const mes = partes[1] ?? "";
  const dia = partes[2] ?? "";
  return `${dia}/${mes}/${anio}`;
}

function formatearMetodoCorto(metodo: string | null): string {
  const mapa: Record<string, string> = {
    EFECTIVO: "Efectivo",
    TARJETA: "Tarjeta",
    TRANSFERENCIA: "Transfer.",
  };
  if (metodo === null) return "Sin cobrar";
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
// Ticket de corte de caja (cierre del día)
// ---------------------------------------------------------------------------

export function generarTicketCierre(datos: DatosTicketCierre): string[] {
  const lineas: string[] = [];

  // Encabezado. Un corte parcial y un cierre producen el mismo papel salvo por esto:
  // hay que poder distinguirlos de un vistazo sobre el mostrador.
  lineas.push(centrar("LAS BRASAS"));
  lineas.push(centrar(datos.parcial ? "CORTE PARCIAL" : "CORTE DE CAJA"));
  lineas.push(separador("="));
  lineas.push(columnas(`Sucursal: ${datos.sucursal}`, formatearFechaCorta(datos.fecha)));
  lineas.push(columnas(datos.parcial ? "Emitido:" : "Cerrado:", formatearHora(datos.cerradoEn)));
  if (datos.parcial) {
    lineas.push(centrar("TURNO ABIERTO - NO ES EL CORTE FINAL"));
  }
  lineas.push(separador("="));

  // Ventas del día
  lineas.push(centrar("VENTAS DEL DIA"));
  lineas.push(separador());
  lineas.push(columnas("Pedidos:", String(datos.numPedidos)));
  lineas.push(columnas("Efectivo:", formatearPrecio(datos.ventasEfectivo)));
  lineas.push(columnas("Tarjeta:", formatearPrecio(datos.ventasTarjeta)));
  lineas.push(columnas("Transferencia:", formatearPrecio(datos.ventasTransfer)));
  lineas.push(columnas("TOTAL VENTAS:", formatearPrecio(datos.totalVentas)));
  lineas.push(separador());

  // Entradas
  if (datos.entradas.length > 0) {
    const totalEntradas = datos.entradas.reduce((s, e) => s + e.monto, 0);
    lineas.push(centrar("ENTRADAS"));
    for (const e of datos.entradas) {
      lineas.push(columnas(`  ${e.concepto}`, formatearPrecio(e.monto)));
    }
    lineas.push(columnas("TOTAL ENTRADAS:", formatearPrecio(totalEntradas)));
    lineas.push(separador());
  }

  // Gastos / retiros
  if (datos.gastos.length > 0) {
    const totalGastos = datos.gastos.reduce((s, g) => s + g.monto, 0);
    lineas.push(centrar("GASTOS / RETIROS"));
    for (const g of datos.gastos) {
      lineas.push(columnas(`  ${g.concepto}`, `-${formatearPrecio(g.monto)}`));
    }
    lineas.push(columnas("TOTAL GASTOS:", `-${formatearPrecio(totalGastos)}`));
    lineas.push(separador());
  }

  // Dinero que debe haber
  const totalEntradas = datos.entradas.reduce((s, e) => s + e.monto, 0);
  const totalGastos = datos.gastos.reduce((s, g) => s + g.monto, 0);
  const enTerminal = datos.ventasTarjeta + datos.ventasTransfer;

  lineas.push(centrar("DINERO ESPERADO"));
  lineas.push(separador());
  lineas.push(columnas("Fondo inicial:", formatearPrecio(datos.fondoInicial)));
  lineas.push(columnas("+ Ventas efectivo:", formatearPrecio(datos.ventasEfectivo)));
  if (totalEntradas > 0) {
    lineas.push(columnas("+ Entradas:", formatearPrecio(totalEntradas)));
  }
  if (totalGastos > 0) {
    lineas.push(columnas("- Gastos:", `-${formatearPrecio(totalGastos)}`));
  }
  lineas.push(columnas("ESPERADO EN CAJA:", formatearPrecio(datos.esperadoEnCaja)));
  lineas.push(columnas("EN TERMINAL:", formatearPrecio(enTerminal)));
  lineas.push(separador());

  // El conteo físico del efectivo y su diferencia se hacen FUERA del sistema. El corte
  // solo reporta el esperado en caja (ver seccion CAJA, arriba) como referencia.
  lineas.push(centrar("Conteo de efectivo: externo"));
  lineas.push(separador());

  // Reembolsos (informativo; no afecta el esperado, ver services/caja.ts)
  if (datos.reembolsosEfectivo > 0) {
    lineas.push(
      columnas("Reembolsos en efectivo:", formatearPrecio(datos.reembolsosEfectivo))
    );
    lineas.push(separador());
  }

  // Lista de pedidos
  lineas.push(centrar("PEDIDOS DEL DIA"));
  lineas.push(separador());
  if (datos.pedidos.length === 0) {
    lineas.push(centrar("Sin pedidos"));
  } else {
    for (const p of datos.pedidos) {
      const folio = `#${String(p.folio).padStart(3, "0")}`;
      if (p.cancelado) {
        lineas.push(columnas(`${folio} CANCELADO`, formatearPrecio(0)));
      } else {
        lineas.push(
          columnas(`${folio} ${formatearMetodoCorto(p.metodoPago)}`, formatearPrecio(p.total))
        );
      }
    }
  }
  lineas.push(separador());

  // Punto de extensión (Fase 2 — M2.2): consumo de carne cruda en kg por tipo de
  // corte y conteo de pollos. Requiere recetas y factor de rendimiento, que aún
  // no existen en el modelo de datos. No se imprime hasta tener esos datos.

  if (datos.notas) {
    lineas.push(`Notas: ${datos.notas}`);
    lineas.push(separador());
  }

  lineas.push(separador("="));
  lineas.push(centrar(datos.parcial ? "Fin del corte parcial" : "Fin del corte"));

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
