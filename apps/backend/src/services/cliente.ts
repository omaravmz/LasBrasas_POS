import { prisma } from "../lib/prisma.js";
import type { Cliente, DireccionCliente } from "@prisma/client";

export type ClienteConDirecciones = Cliente & { direcciones: DireccionCliente[] };

export async function buscarClientePorTelefono(
  telefono: string,
): Promise<ClienteConDirecciones | null> {
  return prisma.cliente.findUnique({
    where: { telefono },
    include: { direcciones: { orderBy: [{ esPrincipal: "desc" }, { id: "asc" }] } },
  });
}

export async function crearCliente(
  id: string,
  telefono: string,
  nombre?: string,
): Promise<ClienteConDirecciones> {
  return prisma.cliente.create({
    data: { id, telefono, ...(nombre !== undefined && { nombre }) },
    include: { direcciones: true },
  });
}

export async function agregarDireccion(
  clienteId: string,
  id: string,
  direccion: string,
  referencia?: string,
): Promise<DireccionCliente> {
  const cuenta = await prisma.direccionCliente.count({ where: { clienteId } });
  const esPrincipal = cuenta === 0;

  return prisma.direccionCliente.create({
    data: {
      id,
      clienteId,
      direccion,
      esPrincipal,
      ...(referencia !== undefined && { referencia }),
    },
  });
}

export async function marcarDireccionPrincipal(
  clienteId: string,
  dirId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.direccionCliente.updateMany({
      where: { clienteId },
      data: { esPrincipal: false },
    }),
    prisma.direccionCliente.update({
      where: { id: dirId },
      data: { esPrincipal: true },
    }),
  ]);
}
