import { VERSION_CONTRATO, HEADER_VERSION, CodigoError } from "@brasas/shared";

const BASE_URL = import.meta.env["VITE_API_URL"] ?? "/api";
const DEVICE_TOKEN = import.meta.env["VITE_DEVICE_TOKEN"] ?? "";

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// El backend rechaza con 426 CLIENTE_DESACTUALIZADO cualquier request de una app cuya
// versión de contrato sea anterior a la mínima que acepta.
//
// Cuando eso pasa: se bloquea la SINCRONIZACIÓN, no la venta. La terminal sigue
// cobrando e imprimiendo con normalidad y las operaciones se acumulan en la cola local,
// intactas, hasta que la app se actualice. Ver DISENO_BLOQUE1.md §1.
export function esClienteDesactualizado(err: unknown): boolean {
  return esApiError(err) && err.code === CodigoError.CLIENTE_DESACTUALIZADO;
}

// Un fallo de red arroja un TypeError, que también trae `message`; lo que
// distingue a una respuesta de error del backend es el `code`.
function esApiError(err: unknown): err is ApiError {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; message?: unknown };
  return typeof e.code === "string" && typeof e.message === "string";
}

/**
 * Traduce lo que arroja `apiFetch` a un mensaje para el usuario. El backend
 * responde `{ code, message }`; solo cuando no hay respuesta (fetch falló) se
 * culpa a la conexión.
 */
export function mensajeError(err: unknown, fallback: string): string {
  if (esApiError(err)) return err.message;
  return `${fallback} Verifica la conexión.`;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": DEVICE_TOKEN,
      // Versión del contrato que habla ESTE build. Queda horneada en el bundle: una
      // terminal con la app vieja sigue enviando el número viejo aunque el backend ya
      // sea nuevo, y es justo así como el servidor la detecta.
      [HEADER_VERSION]: String(VERSION_CONTRATO),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ code: "UNKNOWN", message: res.statusText }));
    throw error;
  }

  return res.json() as Promise<T>;
}
