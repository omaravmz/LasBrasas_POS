-- Bloque 1 — fase CONTRACT.
--
-- Cierra la migración expand/contract. A partir de aquí, un pedido SIN día de operación
-- es imposible: la base lo rechaza.
--
-- Requisitos que ya se cumplen antes de aplicarla:
--   1. Todas las filas tienen "fechaOperativa" (migración de backfill).
--   2. El backend nuevo la escribe siempre (services/pedido.ts).
--   3. El POS la envía en cada pedido (buildPayload).
--
-- Con la columna en NOT NULL, el índice único (sucursalId, fechaOperativa, folio) pasa a
-- ser una garantía total: mientras admitía NULL, dos pedidos sin fecha no colisionaban
-- entre sí, porque en Postgres los NULL se consideran distintos.

ALTER TABLE "Pedido" ALTER COLUMN "fechaOperativa" SET NOT NULL;

-- Lo mismo para la versión de catálogo: sin ella no se puede decidir si un precio
-- discrepante es un bug del cliente o una venta offline legítima.
ALTER TABLE "Pedido" ALTER COLUMN "catalogoVersion" SET NOT NULL;
