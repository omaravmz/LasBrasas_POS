import { prisma } from "../lib/prisma.js";
import type { Decimal } from "@prisma/client/runtime/library.js";
import type { MetodoPago, OrigenPedido, Pedido } from "@prisma/client";

export interface SeleccionInput {
  id: string;
  varianteId: string;
  proporcion: number;
}

export interface ItemPedidoInput {
  id: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  notas?: string;
  selecciones: SeleccionInput[];
}

export interface CrearPedidoInput {
  id: string;
  folio: number;
  sucursalId: string;
  dispositivoId?: string;
  clienteId?: string;
  origen: OrigenPedido;
  metodoPago: MetodoPago;
  total: number;
  notas?: string;
  horaRecoleccion?: string;
  items: ItemPedidoInput[];
}

export interface CancelarPedidoInput {
  id: string;
  metodoPago: MetodoPago | null;
  total: Decimal;
}

export async function cancelarPedido(input: CancelarPedidoInput): Promise<Pedido> {
  const estabaCobrado = input.metodoPago !== null;

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.pedido.update({
      where: { id: input.id },
      data: {
        estado: "CANCELADO",
        ...(estabaCobrado && {
          reembolsado: true,
          montoReembolso: input.total,
          fechaReembolso: new Date(),
        }),
      },
    });

    // Punto de extensión M2.2: revertir descuento de inventario por receta
    // await revertirInventarioPorPedido(tx, input.id);

    return actualizado;
  });
}

export async function crearPedido(input: CrearPedidoInput): Promise<Pedido> {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.create({
      data: {
        id: input.id,
        folio: input.folio,
        sucursalId: input.sucursalId,
        dispositivoId: input.dispositivoId ?? null,
        clienteId: input.clienteId ?? null,
        origen: input.origen,
        estado: "PENDIENTE",
        metodoPago: input.metodoPago,
        total: input.total,
        notas: input.notas ?? null,
        horaRecoleccion: input.horaRecoleccion ? new Date(input.horaRecoleccion) : null,
        items: {
          create: input.items.map((item) => ({
            id: item.id,
            productoId: item.productoId,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            notas: item.notas ?? null,
            selecciones: {
              create: item.selecciones.map((sel) => ({
                id: sel.id,
                varianteId: sel.varianteId,
                proporcion: sel.proporcion,
              })),
            },
          })),
        },
      },
    });

    return pedido;
  });
}
