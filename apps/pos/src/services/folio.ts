import { getLocalDB } from "../db/db.js";

interface FolioState {
  fecha: string; // YYYY-MM-DD
  ultimo: number;
}

function hoyLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mazatlan" });
}

async function leerEstado(): Promise<FolioState> {
  const db = await getLocalDB();
  const raw = await db.getConfig("folio_dia");
  if (!raw) return { fecha: "", ultimo: 0 };
  try {
    return JSON.parse(raw) as FolioState;
  } catch {
    return { fecha: "", ultimo: 0 };
  }
}

export async function peekFolio(): Promise<number> {
  const estado = await leerEstado();
  const hoy = hoyLocal();
  return estado.fecha === hoy ? estado.ultimo + 1 : 1;
}

export async function avanzarFolio(): Promise<number> {
  const db = await getLocalDB();
  const estado = await leerEstado();
  const hoy = hoyLocal();
  const nuevo = estado.fecha === hoy ? estado.ultimo + 1 : 1;
  await db.setConfig("folio_dia", JSON.stringify({ fecha: hoy, ultimo: nuevo }));
  return nuevo;
}
