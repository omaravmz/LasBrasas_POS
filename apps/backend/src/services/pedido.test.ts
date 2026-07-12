import { describe, it, expect } from "vitest";
import { esTransicionValida } from "./pedido.js";

describe("esTransicionValida", () => {
  describe("MOSTRADOR", () => {
    it("permite entregar directo desde PENDIENTE", () => {
      // El cliente espera en el mostrador y se lleva el pedido: no hay etapa
      // intermedia de "listo para recoger".
      expect(esTransicionValida("MOSTRADOR", "PENDIENTE", "ENTREGADO")).toBe(true);
    });

    it("permite pasar por LISTO si se quiere", () => {
      expect(esTransicionValida("MOSTRADOR", "PENDIENTE", "LISTO")).toBe(true);
      expect(esTransicionValida("MOSTRADOR", "LISTO", "ENTREGADO")).toBe(true);
    });

    it("permite cancelar mientras no esté entregado", () => {
      expect(esTransicionValida("MOSTRADOR", "PENDIENTE", "CANCELADO")).toBe(true);
      expect(esTransicionValida("MOSTRADOR", "LISTO", "CANCELADO")).toBe(true);
    });
  });

  describe("pedidos a distancia (TELEFONO, WHATSAPP, DELIVERY)", () => {
    it("NO permite entregar directo desde PENDIENTE", () => {
      expect(esTransicionValida("TELEFONO", "PENDIENTE", "ENTREGADO")).toBe(false);
      expect(esTransicionValida("WHATSAPP", "PENDIENTE", "ENTREGADO")).toBe(false);
      expect(esTransicionValida("DELIVERY", "PENDIENTE", "ENTREGADO")).toBe(false);
    });

    it("exige pasar por LISTO antes de entregar", () => {
      expect(esTransicionValida("TELEFONO", "PENDIENTE", "LISTO")).toBe(true);
      expect(esTransicionValida("TELEFONO", "LISTO", "ENTREGADO")).toBe(true);
      expect(esTransicionValida("DELIVERY", "PENDIENTE", "LISTO")).toBe(true);
      expect(esTransicionValida("DELIVERY", "LISTO", "ENTREGADO")).toBe(true);
    });

    it("permite cancelar mientras no esté entregado", () => {
      expect(esTransicionValida("TELEFONO", "PENDIENTE", "CANCELADO")).toBe(true);
      expect(esTransicionValida("DELIVERY", "LISTO", "CANCELADO")).toBe(true);
    });
  });

  describe("estados terminales", () => {
    it("un pedido ENTREGADO ya no cambia de estado", () => {
      expect(esTransicionValida("MOSTRADOR", "ENTREGADO", "CANCELADO")).toBe(false);
      expect(esTransicionValida("MOSTRADOR", "ENTREGADO", "PENDIENTE")).toBe(false);
      expect(esTransicionValida("DELIVERY", "ENTREGADO", "LISTO")).toBe(false);
    });

    it("un pedido CANCELADO ya no cambia de estado", () => {
      expect(esTransicionValida("MOSTRADOR", "CANCELADO", "PENDIENTE")).toBe(false);
      expect(esTransicionValida("TELEFONO", "CANCELADO", "ENTREGADO")).toBe(false);
    });
  });

  it("no permite retroceder de LISTO a PENDIENTE", () => {
    expect(esTransicionValida("MOSTRADOR", "LISTO", "PENDIENTE")).toBe(false);
    expect(esTransicionValida("TELEFONO", "LISTO", "PENDIENTE")).toBe(false);
  });
});
