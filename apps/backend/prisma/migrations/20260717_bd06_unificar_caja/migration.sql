-- BD-06 · Unificar MovimientoCaja / GastoDia / EntradaDia en una sola tabla.
--
-- PROBLEMA
-- Tres tablas para dos conceptos. GastoDia y EntradaDia eran idénticas salvo
-- `fotoTicket`, y el cierre COPIABA los movimientos del día reutilizando el mismo UUID:
-- dos filas en tablas distintas con el mismo id, sin ninguna FK que declarara la
-- relación. Un vínculo implícito e invisible para la base.
--
-- La auditoría previa demostró que ese vínculo YA ESTABA ROTO: 2 de los 4 GastoDia no
-- tenían ningún MovimientoCaja con su id (son gastos de un cierre anterior a que
-- MovimientoCaja existiera, creados directamente al cerrar). Por eso este backfill NO
-- asume la correspondencia: la comprueba, y reconstruye lo que falta.
--
-- SOLUCIÓN
-- Una sola tabla. El ciclo de vida pasa a ser explícito:
--   cierreDiaId IS NULL     -> movimiento vivo del día en curso. Editable, borrable.
--   cierreDiaId IS NOT NULL -> sellado por el cierre. Inmutable.
--
-- La inmutabilidad del corte se consigue bloqueando la escritura sobre lo sellado
-- (services/caja.ts), no duplicando filas.

-- ---------------------------------------------------------------------------
-- 1. Ampliar MovimientoCaja
-- ---------------------------------------------------------------------------
ALTER TABLE "MovimientoCaja" ADD COLUMN "cierreDiaId" TEXT;
ALTER TABLE "MovimientoCaja" ADD COLUMN "fotoTicket"  TEXT;

ALTER TABLE "MovimientoCaja"
    ADD CONSTRAINT "MovimientoCaja_cierreDiaId_fkey"
    FOREIGN KEY ("cierreDiaId") REFERENCES "CierreDia"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "MovimientoCaja_cierreDiaId_idx" ON "MovimientoCaja"("cierreDiaId");

-- ---------------------------------------------------------------------------
-- 2. Sellar los movimientos que SÍ tienen su copia en el snapshot
-- ---------------------------------------------------------------------------
UPDATE "MovimientoCaja" m
SET "cierreDiaId" = g."cierreDiaId",
    "fotoTicket"  = g."fotoTicket"
FROM "GastoDia" g
WHERE g."id" = m."id";

UPDATE "MovimientoCaja" m
SET "cierreDiaId" = e."cierreDiaId"
FROM "EntradaDia" e
WHERE e."id" = m."id";

-- ---------------------------------------------------------------------------
-- 3. Reconstruir los movimientos que NUNCA existieron
-- ---------------------------------------------------------------------------
-- Gastos y entradas de cierres antiguos, creados directamente en el cierre cuando
-- MovimientoCaja todavía no existía. La sucursal y la fecha se toman de su CierreDia:
-- es la información correcta, y es la única disponible.
INSERT INTO "MovimientoCaja"
    ("id", "sucursalId", "fecha", "tipo", "concepto", "monto", "fotoTicket", "creadoEn", "cierreDiaId")
SELECT
    g."id", c."sucursalId", c."fecha", 'GASTO', g."concepto", g."monto",
    g."fotoTicket", g."creadoEn", g."cierreDiaId"
FROM "GastoDia" g
JOIN "CierreDia" c ON c."id" = g."cierreDiaId"
WHERE NOT EXISTS (SELECT 1 FROM "MovimientoCaja" m WHERE m."id" = g."id");

INSERT INTO "MovimientoCaja"
    ("id", "sucursalId", "fecha", "tipo", "concepto", "monto", "creadoEn", "cierreDiaId")
SELECT
    e."id", c."sucursalId", c."fecha", 'ENTRADA', e."concepto", e."monto",
    e."creadoEn", e."cierreDiaId"
FROM "EntradaDia" e
JOIN "CierreDia" c ON c."id" = e."cierreDiaId"
WHERE NOT EXISTS (SELECT 1 FROM "MovimientoCaja" m WHERE m."id" = e."id");

-- ---------------------------------------------------------------------------
-- 4. Retirar las tablas duplicadas
-- ---------------------------------------------------------------------------
DROP TABLE "GastoDia";
DROP TABLE "EntradaDia";
