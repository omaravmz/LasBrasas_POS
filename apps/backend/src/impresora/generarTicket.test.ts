import { describe, it, expect } from "vitest";
import { generarTicketCliente, generarTicketProduccion } from "./generarTicket.js";
import type { DatosTicket } from "./ticket.js";

const pedidoEjemplo: DatosTicket = {
  folio: 42,
  sucursal: "Pradera Dorada",
  fecha: new Date("2026-05-27T19:34:00Z"), // 12:34 pm Mazatlán
  origen: "MOSTRADOR",
  metodoPago: "EFECTIVO",
  total: 545,
  lineas: [
    {
      cantidad: 2,
      nombre: "Carne Asada 2 personas",
      precioUnitario: 220,
      subtotal: 440,
      cortes: [{ nombre: "Sirloin", proporcion: 1.0 }],
    },
    {
      cantidad: 1,
      nombre: "¼ Pollo",
      precioUnitario: 80,
      subtotal: 80,
    },
    {
      cantidad: 1,
      nombre: "Refresco 600ml",
      precioUnitario: 25,
      subtotal: 25,
    },
  ],
};

const pedidoMezclaCortes: DatosTicket = {
  ...pedidoEjemplo,
  folio: 43,
  lineas: [
    {
      cantidad: 1,
      nombre: "Carne Asada 4 personas",
      precioUnitario: 410,
      subtotal: 410,
      cortes: [
        { nombre: "Sirloin", proporcion: 0.5 },
        { nombre: "New York", proporcion: 0.5 },
      ],
    },
  ],
  total: 410,
};

describe("generarTicketCliente", () => {
  it("contiene el folio formateado", () => {
    const lineas = generarTicketCliente(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("Folio: #042");
  });

  it("contiene el nombre de la sucursal", () => {
    const lineas = generarTicketCliente(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("Pradera Dorada");
  });

  it("contiene el total correcto", () => {
    const lineas = generarTicketCliente(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("$545.00");
  });

  it("muestra el corte seleccionado", () => {
    const lineas = generarTicketCliente(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("Sirloin");
  });

  it("muestra porcentaje en mezcla de cortes", () => {
    const lineas = generarTicketCliente(pedidoMezclaCortes);
    const texto = lineas.join("\n");
    expect(texto).toContain("Sirloin (50%)");
    expect(texto).toContain("New York (50%)");
  });

  it("muestra el método de pago", () => {
    const lineas = generarTicketCliente(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("Efectivo");
  });

  it("contiene datos de contacto", () => {
    const lineas = generarTicketCliente(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("667-482-2244");
    expect(texto).toContain("667-176-0101");
    expect(texto).toContain("@lasbrasascln");
  });

  it("ninguna línea excede 48 caracteres", () => {
    const lineas = generarTicketCliente(pedidoEjemplo);
    for (const linea of lineas) {
      expect(linea.length, `Línea muy larga: "${linea}"`).toBeLessThanOrEqual(48);
    }
  });

  it("precio unitario visible cuando cantidad > 1", () => {
    const lineas = generarTicketCliente(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("$220.00 c/u");
  });
});

describe("generarTicketProduccion", () => {
  it("contiene el folio", () => {
    const lineas = generarTicketProduccion(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("Folio: #042");
  });

  it("NO contiene precios", () => {
    const lineas = generarTicketProduccion(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).not.toContain("$545");
    expect(texto).not.toContain("$220");
  });

  it("contiene todos los items", () => {
    const lineas = generarTicketProduccion(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("Carne Asada 2 personas");
    expect(texto).toContain("¼ Pollo");
    expect(texto).toContain("Refresco 600ml");
  });

  it("contiene el origen del pedido", () => {
    const lineas = generarTicketProduccion(pedidoEjemplo);
    const texto = lineas.join("\n");
    expect(texto).toContain("MOSTRADOR");
  });

  it("ninguna línea excede 48 caracteres", () => {
    const lineas = generarTicketProduccion(pedidoEjemplo);
    for (const linea of lineas) {
      expect(linea.length, `Línea muy larga: "${linea}"`).toBeLessThanOrEqual(48);
    }
  });
});
