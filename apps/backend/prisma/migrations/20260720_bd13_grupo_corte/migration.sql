-- BD-13 · El grupo de corte deja de ser un número mágico, y pasa a llevar precio.
--
-- PROBLEMA 1 (el que estaba en el backlog)
-- `ProductoVariante.grupoPrecio` era un `Int?`. Los valores 1 y 2 no significaban nada
-- para la base: nada impedía un `grupoPrecio = 7`. RN-01 (todos los cortes de un paquete
-- deben ser del mismo grupo) dependía de un entero sin dominio.
--
-- PROBLEMA 2 (encontrado al implementarlo, y bastante peor)
-- El campo se llama grupoPRECIO, y el negocio confirma que el Grupo 2 (Cabrería, Rib Eye)
-- SÍ cuesta más que el Grupo 1 (Diezmillo, Sirloin, New York). Pero el modelo no podía
-- expresarlo: `Producto.precio` es un único número por paquete y `ProductoVariante` no
-- tenía precio. Es decir, hasta ahora un paquete con Rib Eye se cobraba EXACTAMENTE IGUAL
-- que uno con Sirloin.
--
-- Y el sobreprecio no es plano: escala con la cantidad de carne del paquete. Por eso el
-- precio se modela por (producto, grupo), no como un recargo fijo del grupo.

-- ---------------------------------------------------------------------------
-- 1. Grupos de corte como entidad
-- ---------------------------------------------------------------------------
CREATE TABLE "GrupoCorte" (
    "id"     TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden"  INTEGER NOT NULL,

    CONSTRAINT "GrupoCorte_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrupoCorte_nombre_key" ON "GrupoCorte"("nombre");

INSERT INTO "GrupoCorte" ("id", "nombre", "orden") VALUES
    ('grupo-corte-1', 'Grupo 1', 1),   -- Diezmillo, Sirloin, New York
    ('grupo-corte-2', 'Grupo 2', 2);   -- Cabrería, Rib Eye

-- ---------------------------------------------------------------------------
-- 2. La variante apunta al grupo por FK, no por un entero suelto
-- ---------------------------------------------------------------------------
ALTER TABLE "ProductoVariante" ADD COLUMN "grupoCorteId" TEXT;

UPDATE "ProductoVariante" SET "grupoCorteId" = 'grupo-corte-1' WHERE "grupoPrecio" = 1;
UPDATE "ProductoVariante" SET "grupoCorteId" = 'grupo-corte-2' WHERE "grupoPrecio" = 2;

ALTER TABLE "ProductoVariante" ADD CONSTRAINT "ProductoVariante_grupoCorteId_fkey"
    FOREIGN KEY ("grupoCorteId") REFERENCES "GrupoCorte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ProductoVariante_grupoCorteId_idx" ON "ProductoVariante"("grupoCorteId");

ALTER TABLE "ProductoVariante" DROP COLUMN "grupoPrecio";

-- ---------------------------------------------------------------------------
-- 3. Precio por (producto, grupo)
-- ---------------------------------------------------------------------------
CREATE TABLE "PrecioProductoGrupo" (
    "id"           TEXT NOT NULL,
    "productoId"   TEXT NOT NULL,
    "grupoCorteId" TEXT NOT NULL,
    "precio"       DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PrecioProductoGrupo_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PrecioProductoGrupo"
    ADD CONSTRAINT "PrecioProductoGrupo_precio_no_negativo" CHECK ("precio" >= 0);

CREATE UNIQUE INDEX "PrecioProductoGrupo_productoId_grupoCorteId_key"
    ON "PrecioProductoGrupo"("productoId", "grupoCorteId");

ALTER TABLE "PrecioProductoGrupo" ADD CONSTRAINT "PrecioProductoGrupo_productoId_fkey"
    FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrecioProductoGrupo" ADD CONSTRAINT "PrecioProductoGrupo_grupoCorteId_fkey"
    FOREIGN KEY ("grupoCorteId") REFERENCES "GrupoCorte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: cada paquete de carne arranca con SU PRECIO ACTUAL en ambos grupos.
--
-- No se inventa el sobreprecio del Grupo 2: eso es un dato del negocio y nadie lo ha dado.
-- Lo que se preserva es exactamente lo que el sistema cobraba hasta ahora (el mismo precio
-- para cualquier corte), y ahora la estructura permite diferenciarlo en cuanto el negocio
-- entregue los precios reales.
INSERT INTO "PrecioProductoGrupo" ("id", "productoId", "grupoCorteId", "precio")
SELECT
    'ppg-' || p."id" || '-' || g."id",
    p."id",
    g."id",
    p."precio"
FROM "Producto" p
CROSS JOIN "GrupoCorte" g
WHERE p."requiereCorte" = true;
