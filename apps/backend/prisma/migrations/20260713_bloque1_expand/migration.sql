-- Bloque 1 (BD-02, BD-03, BD-04) — fase EXPAND.
--
-- Todas las columnas nuevas son nullable o tienen default: el backend actual sigue
-- funcionando sin cambios después de aplicar esta migración. La fase CONTRACT
-- (NOT NULL + índice único de folio) va en una migración posterior, una vez que el
-- backend nuevo ya lleve un tiempo escribiendo las columnas.
--
-- Ver DISENO_BLOQUE1.md §2, §3 y §4.

-- ---------------------------------------------------------------------------
-- BD-02 · Fecha operativa del pedido
-- ---------------------------------------------------------------------------
-- Día de operación al que pertenece la venta. La estampa la terminal en el momento
-- del cobro. Es DATE (no TIMESTAMP) a propósito: un día de operación es un día
-- calendario, no un instante.
ALTER TABLE "Pedido" ADD COLUMN "fechaOperativa" DATE;

-- ---------------------------------------------------------------------------
-- BD-04 · Versión de catálogo y marca de precios desactualizados
-- ---------------------------------------------------------------------------
ALTER TABLE "Pedido" ADD COLUMN "catalogoVersion" INTEGER;
ALTER TABLE "Pedido" ADD COLUMN "preciosDesactualizados" BOOLEAN NOT NULL DEFAULT false;

-- Contador global del catálogo. Fila única (id = 1).
CREATE TABLE "CatalogoVersion" (
    "id"      INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CatalogoVersion_pkey" PRIMARY KEY ("id")
);

-- Refuerza el singleton: no puede existir más de una fila.
ALTER TABLE "CatalogoVersion"
    ADD CONSTRAINT "CatalogoVersion_singleton" CHECK ("id" = 1);

INSERT INTO "CatalogoVersion" ("id", "version") VALUES (1, 1);

-- ---------------------------------------------------------------------------
-- Índice de lectura (BD-14, parcial)
-- ---------------------------------------------------------------------------
-- Lo usan calcularVentasDia() y listarPedidosDia(), que hoy hacen seq scan.
CREATE INDEX "Pedido_sucursalId_fechaOperativa_idx" ON "Pedido"("sucursalId", "fechaOperativa");
