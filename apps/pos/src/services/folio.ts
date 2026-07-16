import { getLocalDB } from "../db/db.js";
import { diaOperativo } from "./diaOperativo.js";

// Folio: consecutivo diario por sucursal (BD-03).
//
// ANTES: el folio vivía en una clave de config (`folio_dia`) SEPARADA de los pedidos.
// Ese contador podía desincronizarse de los datos: si se borraba el storage, se
// restauraba el equipo o se reinstalaba la app, volvía a 1 aunque los pedidos siguieran
// en la base local. Resultado: dos pedidos distintos con el mismo folio, en silencio.
//
// No es hipotético. La auditoría del histórico encontró que YA HABÍA OCURRIDO: el
// 2026-07-08 los folios 1, 2, 3 y 4 estaban repetidos, en dos tandas del mismo día.
//
// AHORA: el folio se deriva de los propios pedidos. El contador no puede desviarse de
// los datos porque *es* los datos:
//
//   siguienteFolio = MAX(folio de los pedidos locales de hoy, piso del servidor) + 1
//
// Como red de seguridad, el servidor tiene además un índice único sobre
// (sucursalId, fechaOperativa, folio): si aun así se colara un duplicado, la
// sincronización lo rechaza con FOLIO_DUPLICADO en vez de aceptarlo callando.

// El "piso" cubre el hueco que el cálculo local no puede ver: si la terminal PERDIÓ
// pedidos (restauración desde un respaldo viejo, storage corrupto), su MAX local se
// queda por detrás del folio real y volvería a emitir folios ya usados. El servidor sabe
// cuál fue el último folio que recibió; ese valor se guarda como piso y el contador
// arranca por encima de él.
function clavePiso(dia: string): string {
  return `folio_piso:${dia}`;
}

async function pisoDelDia(dia: string): Promise<number> {
  const db = await getLocalDB();
  const raw = await db.getConfig(clavePiso(dia));
  const piso = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(piso) ? piso : 0;
}

export async function peekFolio(): Promise<number> {
  const db = await getLocalDB();
  const dia = diaOperativo();

  const [maxLocal, piso] = await Promise.all([db.getMaxFolio(dia), pisoDelDia(dia)]);

  return Math.max(maxLocal, piso) + 1;
}

// Reconciliación con el servidor: si el servidor conoce un folio más alto que el que la
// terminal puede ver en sus propios datos, se sube el piso. No inventa pedidos; solo
// mueve el punto de partida del contador para no repetir folios ya emitidos.
export async function reconciliarFolio(folioMaximoServidor: number): Promise<void> {
  const dia = diaOperativo();
  const piso = await pisoDelDia(dia);

  if (folioMaximoServidor > piso) {
    const db = await getLocalDB();
    await db.setConfig(clavePiso(dia), String(folioMaximoServidor));
  }
}
