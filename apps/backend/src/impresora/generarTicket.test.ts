import { describe, it, expect } from "vitest";
import {
  generarTicketCliente,
  generarTicketProduccion,
  generarTicketCierre,
} from "./generarTicket.js";
import type { DatosTicket, DatosTicketCierre } from "./ticket.js";

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

// ---------------------------------------------------------------------------
// Corte de caja

const cierreEjemplo: DatosTicketCierre = {
  sucursal: "Pradera Dorada",
  fecha: "2026-07-12",
  cerradoEn: new Date("2026-07-13T00:12:00Z"), // 5:12 pm Mazatlán
  fondoInicial: 500,
  ventasEfectivo: 1200,
  ventasTarjeta: 800,
  ventasTransfer: 150,
  totalVentas: 2150,
  numPedidos: 3,
  pedidos: [
    { folio: 1, total: 1200, metodoPago: "EFECTIVO", cancelado: false },
    { folio: 2, total: 800, metodoPago: "TARJETA", cancelado: false },
    { folio: 3, total: 150, metodoPago: "TRANSFERENCIA", cancelado: false },
    { folio: 4, total: 300, metodoPago: "EFECTIVO", cancelado: true },
  ],
  entradas: [{ concepto: "Fondo extra", monto: 200 }],
  gastos: [
    { concepto: "Gas", monto: 150 },
    { concepto: "Servilletas", monto: 50 },
  ],
  reembolsosEfectivo: 0,
  // 500 + 1200 + 200 - 200 = 1700
  esperadoEnCaja: 1700,
  conteoFisico: 1690,
  diferencia: -10,
};

describe("generarTicketCierre", () => {
  it("muestra las ventas por método de pago", () => {
    const texto = generarTicketCierre(cierreEjemplo).join("\n");
    expect(texto).toContain("Efectivo:");
    expect(texto).toContain("$1200.00");
    expect(texto).toContain("Tarjeta:");
    expect(texto).toContain("$800.00");
    expect(texto).toContain("Transferencia:");
    expect(texto).toContain("$150.00");
  });

  it("muestra el total de ventas y el número de pedidos", () => {
    const texto = generarTicketCierre(cierreEjemplo).join("\n");
    expect(texto).toContain("TOTAL VENTAS:");
    expect(texto).toContain("$2150.00");
    expect(texto).toContain("Pedidos:");
  });

  it("desglosa los gastos y los resta del esperado", () => {
    const texto = generarTicketCierre(cierreEjemplo).join("\n");
    expect(texto).toContain("Gas");
    expect(texto).toContain("Servilletas");
    expect(texto).toContain("TOTAL GASTOS:");
    expect(texto).toContain("-$200.00");
    expect(texto).toContain("ESPERADO EN CAJA:");
    expect(texto).toContain("$1700.00");
  });

  it("desglosa las entradas", () => {
    const texto = generarTicketCierre(cierreEjemplo).join("\n");
    expect(texto).toContain("Fondo extra");
    expect(texto).toContain("TOTAL ENTRADAS:");
  });

  it("muestra el dinero esperado en terminal (tarjeta + transferencia)", () => {
    const texto = generarTicketCierre(cierreEjemplo).join("\n");
    expect(texto).toContain("EN TERMINAL:");
    expect(texto).toContain("$950.00");
  });

  it("marca la diferencia como FALTA cuando el conteo es menor", () => {
    const texto = generarTicketCierre(cierreEjemplo).join("\n");
    expect(texto).toContain("DIFERENCIA (FALTA)");
    // El signo va antes del símbolo de peso: -$10.00, no $-10.00
    expect(texto).toContain("-$10.00");
    expect(texto).not.toContain("$-10.00");
  });

  it("marca la diferencia como CUADRA cuando no hay diferencia", () => {
    const texto = generarTicketCierre({
      ...cierreEjemplo,
      conteoFisico: 1700,
      diferencia: 0,
    }).join("\n");
    expect(texto).toContain("DIFERENCIA (CUADRA)");
  });

  it("marca la diferencia como SOBRA cuando el conteo es mayor", () => {
    const texto = generarTicketCierre({
      ...cierreEjemplo,
      conteoFisico: 1750,
      diferencia: 50,
    }).join("\n");
    expect(texto).toContain("DIFERENCIA (SOBRA)");
    expect(texto).toContain("+$50.00");
  });

  it("lista los pedidos con su folio y monto", () => {
    const texto = generarTicketCierre(cierreEjemplo).join("\n");
    expect(texto).toContain("#001");
    expect(texto).toContain("#002");
    expect(texto).toContain("#003");
  });

  it("muestra los pedidos cancelados en $0", () => {
    const lineas = generarTicketCierre(cierreEjemplo);
    const lineaCancelado = lineas.find((l) => l.includes("#004"));
    expect(lineaCancelado).toBeDefined();
    expect(lineaCancelado).toContain("CANCELADO");
    expect(lineaCancelado).toContain("$0.00");
    expect(lineaCancelado).not.toContain("$300.00");
  });

  it("ninguna línea excede 48 caracteres", () => {
    const lineas = generarTicketCierre({
      ...cierreEjemplo,
      gastos: [{ concepto: "Un concepto de gasto extremadamente largo", monto: 1234.56 }],
    });
    for (const linea of lineas) {
      expect(linea.length, `Línea muy larga: "${linea}"`).toBeLessThanOrEqual(48);
    }
  });

  it("omite las secciones de entradas y gastos cuando no hay", () => {
    const texto = generarTicketCierre({
      ...cierreEjemplo,
      entradas: [],
      gastos: [],
    }).join("\n");
    expect(texto).not.toContain("TOTAL ENTRADAS:");
    expect(texto).not.toContain("TOTAL GASTOS:");
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
