import { getConfig, setConfig } from "../db/index.js";

interface FolioState {
  fecha: string; // YYYY-MM-DD
  ultimo: number;
}

// Retorna la fecha local en formato YYYY-MM-DD (zona America/Mazatlan)
function hoyLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mazatlan" });
}

async function leerEstado(): Promise<FolioState> {
  const raw = await getConfig("folio_dia");
  if (!raw) return { fecha: "", ultimo: 0 };
  try {
    return JSON.parse(raw) as FolioState;
  } catch {
    return { fecha: "", ultimo: 0 };
  }
}

// Retorna el próximo folio sin modificar el contador
export async function peekFolio(): Promise<number> {
  const estado = await leerEstado();
  const hoy = hoyLocal();
  return estado.fecha === hoy ? estado.ultimo + 1 : 1;
}

// Atomically incrementa y persiste el contador, retornando el folio asignado
export async function avanzarFolio(): Promise<number> {
  const estado = await leerEstado();
  const hoy = hoyLocal();
  const nuevo = estado.fecha === hoy ? estado.ultimo + 1 : 1;
  await setConfig("folio_dia", JSON.stringify({ fecha: hoy, ultimo: nuevo }));
  return nuevo;
}
