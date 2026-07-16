import { describe, it, expect } from "vitest";
import { precioDeProducto, precioDeGrupo, grupoDeCortes, totalDelBorrador } from "../precio.js";
import type { ProductoLocal, VarianteLocal } from "../../db/types.js";
import type { ItemBorrador, CorteBorrador } from "../../types/pedido.js";

// BD-13. El negocio confirmó que un paquete de carne NO cuesta lo mismo con cortes del
// Grupo 2 (Cabrería, Rib Eye) que del Grupo 1 (Diezmillo, Sirloin, New York), y que el
// sobreprecio depende del paquete.
//
// Hasta ahora el POS cobraba `producto.precio` para cualquier corte: un paquete con Rib Eye
// se cobraba EXACTAMENTE IGUAL que uno con Sirloin. El modelo ni siquiera podía expresar la
// diferencia.

const G1 = "grupo-corte-1";
const G2 = "grupo-corte-2";

const sirloin: VarianteLocal = { id: "v-sirloin", nombre: "Sirloin", grupoCorteId: G1, activo: true };
const diezmillo: VarianteLocal = { id: "v-diezmillo", nombre: "Diezmillo", grupoCorteId: G1, activo: true };
const ribeye: VarianteLocal = { id: "v-ribeye", nombre: "Rib Eye", grupoCorteId: G2, activo: true };

// Paquete de 2 personas: $220 con Grupo 1, $260 con Grupo 2.
const paquete: ProductoLocal = {
  id: "prod-2p",
  categoriaId: "cat-carne",
  nombre: "Carne Asada 2 personas",
  precio: 0, // no se usa: el precio depende del grupo
  activo: true,
  requiereCorte: true,
  orden: 1,
  variantes: [sirloin, diezmillo, ribeye],
  preciosPorGrupo: [
    { grupoCorteId: G1, precio: 220 },
    { grupoCorteId: G2, precio: 260 },
  ],
};

const refresco: ProductoLocal = {
  id: "prod-refresco",
  categoriaId: "cat-bebidas",
  nombre: "Refresco 600ml",
  precio: 25.5,
  activo: true,
  requiereCorte: false,
  orden: 1,
  variantes: [],
  preciosPorGrupo: [],
};

const corte = (variante: VarianteLocal, proporcion = 1): CorteBorrador => ({ variante, proporcion });

const item = (producto: ProductoLocal, cortes: CorteBorrador[], cantidad = 1): ItemBorrador => ({
  id: crypto.randomUUID(),
  producto,
  cantidad,
  cortes,
});

describe("grupoDeCortes", () => {
  it("devuelve el grupo cuando todos los cortes son del mismo", () => {
    expect(grupoDeCortes([corte(sirloin, 0.5), corte(diezmillo, 0.5)])).toBe(G1);
  });

  it("devuelve null si se mezclan grupos (RN-01)", () => {
    expect(grupoDeCortes([corte(sirloin, 0.5), corte(ribeye, 0.5)])).toBeNull();
  });

  it("devuelve null si no hay cortes", () => {
    expect(grupoDeCortes([])).toBeNull();
  });
});

describe("precioDeProducto", () => {
  it("un producto sin corte usa su precio", () => {
    expect(precioDeProducto(refresco, [])).toBe(25.5);
  });

  it("un paquete con cortes del Grupo 1 cuesta el precio del Grupo 1", () => {
    expect(precioDeProducto(paquete, [corte(sirloin)])).toBe(220);
  });

  it("EL MISMO paquete con cortes del Grupo 2 cuesta MÁS", () => {
    // Este es el bug que BD-13 destapó.
    expect(precioDeProducto(paquete, [corte(ribeye)])).toBe(260);
  });

  it("mezclar cortes dentro del mismo grupo no cambia el precio", () => {
    expect(precioDeProducto(paquete, [corte(sirloin, 0.5), corte(diezmillo, 0.5)])).toBe(220);
  });

  it("sin corte elegido todavía no hay precio", () => {
    expect(precioDeProducto(paquete, [])).toBe(0);
  });
});

describe("precioDeGrupo", () => {
  it("permite mostrar el precio de cada grupo antes de elegir", () => {
    expect(precioDeGrupo(paquete, G1)).toBe(220);
    expect(precioDeGrupo(paquete, G2)).toBe(260);
  });
});

describe("totalDelBorrador", () => {
  it("suma cada línea con el precio de SU grupo", () => {
    const total = totalDelBorrador([
      item(paquete, [corte(sirloin)], 1), // 220
      item(paquete, [corte(ribeye)], 1),  // 260
      item(refresco, [], 2),              // 51
    ]);

    expect(total).toBe(531);
  });

  it("no arrastra error de punto flotante", () => {
    // El servidor valida el total en Decimal: un 59.699999999999996 haría que rechazara
    // una venta legítima que el cliente ya pagó.
    const barato: ProductoLocal = { ...refresco, precio: 19.9 };

    expect(19.9 * 3).not.toBe(59.7);
    expect(totalDelBorrador([item(barato, [], 3)])).toBe(59.7);
  });

  it("un borrador vacío suma cero", () => {
    expect(totalDelBorrador([])).toBe(0);
  });
});
