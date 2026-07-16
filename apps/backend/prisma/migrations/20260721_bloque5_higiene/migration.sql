-- Bloque 5 · BD-14 (índices), BD-15 (snapshot de nombres), BD-16 (activo),
--            BD-17 (sync incremental), BD-18 (colapsar Receta).
--
-- Higiene. Ninguno es urgente por sí solo, pero todos son baratos ahora y caros después.

-- ---------------------------------------------------------------------------
-- BD-15 · Snapshot del nombre en la línea del pedido
-- ---------------------------------------------------------------------------
-- El precio histórico ya se congelaba (`ItemPedido.precioUnitario`), pero el nombre no:
-- renombrar un producto reescribía RETROACTIVAMENTE los tickets y los reportes de todos los
-- pedidos pasados. Un ticket impreso es un documento: tiene que poder reimprimirse idéntico.
--
-- Lo escribe el SERVIDOR al crear el pedido, igual que el precio (BD-04).

ALTER TABLE "ItemPedido"        ADD COLUMN "nombreProducto" TEXT;
ALTER TABLE "SeleccionVariante" ADD COLUMN "nombreVariante" TEXT;

-- Backfill: el nombre ACTUAL es la mejor aproximación para lo ya vendido. A partir de
-- ahora queda congelado.
UPDATE "ItemPedido" ip
SET "nombreProducto" = p."nombre"
FROM "Producto" p
WHERE p."id" = ip."productoId" AND ip."nombreProducto" IS NULL;

UPDATE "SeleccionVariante" sv
SET "nombreVariante" = v."nombre"
FROM "ProductoVariante" v
WHERE v."id" = sv."varianteId" AND sv."nombreVariante" IS NULL;

ALTER TABLE "ItemPedido"        ALTER COLUMN "nombreProducto" SET NOT NULL;
ALTER TABLE "SeleccionVariante" ALTER COLUMN "nombreVariante" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- BD-16 · `activo` donde faltaba
-- ---------------------------------------------------------------------------
-- Las FK están en RESTRICT (correcto: protege la historia), así que una categoría o un
-- cliente con registros asociados NO se puede borrar. Sin bandera `activo` tampoco se podía
-- ocultar: quedaban atrapados en el POS para siempre.
ALTER TABLE "Categoria" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Cliente"   ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- BD-17 · Marcas de tiempo para sincronización incremental
-- ---------------------------------------------------------------------------
-- Sin ellas no hay forma de pedir "dame lo que cambió desde X": la terminal tiene que
-- descargar el catálogo ENTERO en cada sincronización.
ALTER TABLE "Categoria" ADD COLUMN "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Categoria" ADD COLUMN "actualizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Producto" ADD COLUMN "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Producto" ADD COLUMN "actualizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ProductoVariante" ADD COLUMN "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProductoVariante" ADD COLUMN "actualizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Insumo" ADD COLUMN "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Insumo" ADD COLUMN "actualizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- BD-18 · Colapsar la tabla `Receta`
-- ---------------------------------------------------------------------------
-- `Receta` era 1-a-1 con Producto y su única columna propia era `productoId`: una entidad
-- sin atributos que añadía un join a cada consulta de receta sin aportar nada. La receta de
-- un producto son, simplemente, sus líneas de ingrediente.

ALTER TABLE "IngredienteReceta" ADD COLUMN "productoId" TEXT;
ALTER TABLE "IngredienteReceta" ADD COLUMN "creadoEn"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "IngredienteReceta" ADD COLUMN "actualizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "IngredienteReceta" ir
SET "productoId" = r."productoId"
FROM "Receta" r
WHERE r."id" = ir."recetaId";

-- Si algún ingrediente hubiera quedado huérfano (receta inexistente), esto fallaría aquí en
-- vez de dejar una receta rota en silencio. Es lo que queremos.
ALTER TABLE "IngredienteReceta" ALTER COLUMN "productoId" SET NOT NULL;

ALTER TABLE "IngredienteReceta" DROP CONSTRAINT "IngredienteReceta_recetaId_fkey";
DROP INDEX IF EXISTS "IngredienteReceta_recetaId_insumoId_key";
ALTER TABLE "IngredienteReceta" DROP COLUMN "recetaId";

ALTER TABLE "IngredienteReceta" ADD CONSTRAINT "IngredienteReceta_productoId_fkey"
    FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BD-12: un insumo no puede aparecer dos veces en la receta del mismo producto.
CREATE UNIQUE INDEX "IngredienteReceta_productoId_insumoId_key"
    ON "IngredienteReceta"("productoId", "insumoId");

DROP TABLE "Receta";

-- ---------------------------------------------------------------------------
-- BD-14 · Índices en las claves foráneas de lectura frecuente
-- ---------------------------------------------------------------------------
-- Prisma no indexa las FK automáticamente en PostgreSQL. Con el volumen de dos sucursales
-- el impacto de rendimiento es hoy despreciable, pero es higiene barata — y las FK sin
-- índice sí muerden en los DELETE y en los joins según crece el histórico.
CREATE INDEX "ItemPedido_pedidoId_idx"              ON "ItemPedido"("pedidoId");
CREATE INDEX "ItemPedido_productoId_idx"            ON "ItemPedido"("productoId");
CREATE INDEX "SeleccionVariante_itemPedidoId_idx"   ON "SeleccionVariante"("itemPedidoId");
CREATE INDEX "IngredienteReceta_insumoId_idx"       ON "IngredienteReceta"("insumoId");
CREATE INDEX "Producto_categoriaId_idx"             ON "Producto"("categoriaId");
CREATE INDEX "ProductoVariante_productoId_idx"      ON "ProductoVariante"("productoId");
CREATE INDEX "DireccionCliente_clienteId_idx"       ON "DireccionCliente"("clienteId");
CREATE INDEX "BolsaSobrante_cierreDiaId_idx"        ON "BolsaSobrante"("cierreDiaId");
CREATE INDEX "Pedido_clienteId_idx"                 ON "Pedido"("clienteId");
