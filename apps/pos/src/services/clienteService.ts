import { apiFetch } from "../lib/api.js";

export interface DireccionBasica {
  id: string;
  direccion: string;
  referencia?: string;
  esPrincipal: boolean;
}

export interface ClienteBasico {
  id: string;
  telefono: string;
  nombre?: string;
  direcciones: DireccionBasica[];
}

export async function buscarCliente(telefono: string): Promise<ClienteBasico | null> {
  try {
    return await apiFetch<ClienteBasico>(`/clientes?telefono=${encodeURIComponent(telefono)}`);
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err &&
        (err as { code: string }).code === "NOT_FOUND") {
      return null;
    }
    throw err;
  }
}

export async function crearCliente(
  id: string,
  telefono: string,
  nombre?: string,
): Promise<ClienteBasico> {
  return apiFetch<ClienteBasico>("/clientes", {
    method: "POST",
    body: JSON.stringify({ id, telefono, ...(nombre !== undefined && { nombre }) }),
  });
}

export async function agregarDireccion(
  clienteId: string,
  id: string,
  direccion: string,
  referencia?: string,
): Promise<DireccionBasica> {
  return apiFetch<DireccionBasica>(`/clientes/${clienteId}/direcciones`, {
    method: "POST",
    body: JSON.stringify({ id, direccion, ...(referencia !== undefined && { referencia }) }),
  });
}

export async function marcarDireccionPrincipal(
  clienteId: string,
  dirId: string,
): Promise<void> {
  await apiFetch<unknown>(`/clientes/${clienteId}/direcciones/${dirId}`, {
    method: "PATCH",
    body: JSON.stringify({ esPrincipal: true }),
  });
}
