-- Bloque 3 — BD-09 (libro mayor de inventario), BD-10 (unidad canónica),
--                BD-11 (transformaciones permitidas como datos).
--
-- CONTEXTO: la auditoría previa encontró CERO filas en InventarioInsumo,
-- TransformacionInsumo, Traslado y BolsaSobrante. No hay ningún saldo ni movimiento que
-- migrar. Sí hay 33 insumos, 12 recetas y 34 ingredientes, cuyas cantidades hay que
-- reescalar a la unidad canónica.
--
-- Es la ventana exacta para hacer este cambio: después de implementar la Fase 2 habría
-- inventario real que convertir, y la reversión de descuentos ya estaría escrita del modo
-- frágil que BD-09 elimina.

-- ---------------------------------------------------------------------------
-- BD-10 · Unidad canónica de almacenamiento
-- ---------------------------------------------------------------------------
-- Un solo enum mezclaba KG con GR y LT con ML. La carne vivía en kilos y las papas en
-- gramos, así que cualquier código que sumara o comparara cantidades entre insumos tenía
-- que saber la unidad de cada uno: un bug de factor 1000 esperando a ocurrir, justo en el
-- descuento por receta.
--
-- Ahora: todo se ALMACENA en GR / ML / PIEZA. La unidad de display solo afecta a cómo se
-- captura y se muestra.

CREATE TYPE "UnidadBase" AS ENUM ('GR', 'ML', 'PIEZA');

ALTER TABLE "Insumo" ADD COLUMN "unidadBase"    "UnidadBase";
ALTER TABLE "Insumo" ADD COLUMN "unidadDisplay" "Unidad";
ALTER TABLE "Insumo" ADD COLUMN "activo"        BOOLEAN NOT NULL DEFAULT true;

-- La unidad actual pasa a ser la de display; la base se deriva de ella.
UPDATE "Insumo" SET
    "unidadDisplay" = "unidad",
    "unidadBase" = CASE "unidad"
        WHEN 'KG'    THEN 'GR'::"UnidadBase"
        WHEN 'GR'    THEN 'GR'::"UnidadBase"
        WHEN 'LT'    THEN 'ML'::"UnidadBase"
        WHEN 'ML'    THEN 'ML'::"UnidadBase"
        WHEN 'PIEZA' THEN 'PIEZA'::"UnidadBase"
    END;

ALTER TABLE "Insumo" ALTER COLUMN "unidadBase"    SET NOT NULL;
ALTER TABLE "Insumo" ALTER COLUMN "unidadDisplay" SET NOT NULL;

-- Ampliar la precisión ANTES de reescalar: en gramos los números son 1000x mayores.
ALTER TABLE "Insumo"               ALTER COLUMN "rendimientoBolsa" TYPE DECIMAL(12,3);
ALTER TABLE "InventarioInsumo"     ALTER COLUMN "cantidad"         TYPE DECIMAL(12,3);
ALTER TABLE "InventarioInsumo"     ALTER COLUMN "umbralAlerta"     TYPE DECIMAL(12,3);
ALTER TABLE "IngredienteReceta"    ALTER COLUMN "cantidad"         TYPE DECIMAL(12,3);
ALTER TABLE "TransformacionInsumo" ALTER COLUMN "cantidadOrigen"   TYPE DECIMAL(12,3);
ALTER TABLE "TransformacionInsumo" ALTER COLUMN "cantidadDestino"  TYPE DECIMAL(12,3);
ALTER TABLE "Traslado"             ALTER COLUMN "cantidad"         TYPE DECIMAL(12,3);
-- Decimal(6,3) topaba en 999.999: en gramos, una bolsa de 5 kg desbordaba.
ALTER TABLE "BolsaSobrante"        ALTER COLUMN "peso"             TYPE DECIMAL(12,3);

-- Reescalar las cantidades de los insumos cuya unidad de almacenamiento cambió
-- (KG -> GR y LT -> ML, ambos ×1000).
UPDATE "IngredienteReceta" ir SET "cantidad" = ir."cantidad" * 1000
FROM "Insumo" i
WHERE i."id" = ir."insumoId" AND i."unidadDisplay" IN ('KG', 'LT');

UPDATE "InventarioInsumo" inv SET
    "cantidad"     = inv."cantidad" * 1000,
    "umbralAlerta" = inv."umbralAlerta" * 1000
FROM "Insumo" i
WHERE i."id" = inv."insumoId" AND i."unidadDisplay" IN ('KG', 'LT');

UPDATE "Insumo" SET "rendimientoBolsa" = "rendimientoBolsa" * 1000
WHERE "unidadDisplay" IN ('KG', 'LT') AND "rendimientoBolsa" IS NOT NULL;

-- (Traslado, TransformacionInsumo y BolsaSobrante están vacías: nada que reescalar.)

ALTER TABLE "Insumo" DROP COLUMN "unidad";

-- Dos insumos no pueden llamarse igual: el nombre es cómo los identifica el personal.
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_nombre_key" UNIQUE ("nombre");

-- ---------------------------------------------------------------------------
-- Fecha operativa en las operaciones de inventario
-- ---------------------------------------------------------------------------
-- Mismo motivo que en BD-02: una operación hecha offline pertenece a la jornada en que
-- ocurrió, no a la del momento en que logró sincronizar.
ALTER TABLE "TransformacionInsumo" ADD COLUMN "fechaOperativa" DATE;
ALTER TABLE "Traslado"             ADD COLUMN "fechaOperativa" DATE;
ALTER TABLE "ConsumoEmpleado"      ADD COLUMN "fechaOperativa" DATE;

UPDATE "TransformacionInsumo" SET "fechaOperativa" = ("fecha" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mazatlan')::date WHERE "fechaOperativa" IS NULL;
UPDATE "Traslado"             SET "fechaOperativa" = ("solicitadoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mazatlan')::date WHERE "fechaOperativa" IS NULL;
UPDATE "ConsumoEmpleado"      SET "fechaOperativa" = ("fecha" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mazatlan')::date WHERE "fechaOperativa" IS NULL;

ALTER TABLE "TransformacionInsumo" ALTER COLUMN "fechaOperativa" SET NOT NULL;
ALTER TABLE "Traslado"             ALTER COLUMN "fechaOperativa" SET NOT NULL;
ALTER TABLE "ConsumoEmpleado"      ALTER COLUMN "fechaOperativa" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- BD-09 · Libro mayor de inventario (append-only)
-- ---------------------------------------------------------------------------
-- InventarioInsumo.cantidad deja de ser la verdad y pasa a ser un saldo DERIVADO,
-- actualizado en la misma transacción que asienta el movimiento. La verdad, y la única
-- fuente reconstruible, es esta tabla.

CREATE TYPE "TipoMovimientoInventario" AS ENUM (
    'ENTRADA', 'VENTA', 'CANCELACION', 'CONSUMO_EMPLEADO',
    'TRASLADO_SALIDA', 'TRASLADO_ENTRADA',
    'TRANSFORMACION_ORIGEN', 'TRANSFORMACION_DESTINO',
    'AJUSTE', 'MERMA'
);

CREATE TYPE "TipoReferencia" AS ENUM (
    'PEDIDO', 'TRASLADO', 'TRANSFORMACION', 'CONSUMO_EMPLEADO',
    'ENTRADA_INVENTARIO', 'AJUSTE_MANUAL', 'CIERRE_DIA'
);

CREATE TABLE "MovimientoInventario" (
    "id"             TEXT NOT NULL,
    "sucursalId"     TEXT NOT NULL,
    "insumoId"       TEXT NOT NULL,
    "cantidad"       DECIMAL(12,3) NOT NULL,   -- CON SIGNO: + entra, - sale
    "tipo"           "TipoMovimientoInventario" NOT NULL,
    "refTipo"        "TipoReferencia" NOT NULL,
    "refId"          TEXT NOT NULL,
    "fecha"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaOperativa" DATE NOT NULL,
    "notas"          TEXT,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- Un movimiento de cantidad cero no es un hecho: es ruido.
ALTER TABLE "MovimientoInventario"
    ADD CONSTRAINT "MovimientoInventario_cantidad_no_cero" CHECK ("cantidad" <> 0);

-- Idempotencia de la sincronización offline: la misma operación no puede asentar dos
-- veces el mismo efecto sobre el mismo insumo. `tipo` entra en la clave porque una misma
-- operación puede producir movimientos distintos (un traslado: SALIDA en origen, ENTRADA
-- en destino; una cancelación referencia el mismo pedido que la venta que revierte).
CREATE UNIQUE INDEX "MovimientoInventario_ref_key"
    ON "MovimientoInventario"("refTipo", "refId", "sucursalId", "insumoId", "tipo");

CREATE INDEX "MovimientoInventario_sucursalId_insumoId_idx"
    ON "MovimientoInventario"("sucursalId", "insumoId");
CREATE INDEX "MovimientoInventario_sucursalId_fechaOperativa_idx"
    ON "MovimientoInventario"("sucursalId", "fechaOperativa");

ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_insumoId_fkey"
    FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BD-11 · Transformaciones permitidas como datos
-- ---------------------------------------------------------------------------
-- "Solo Pollo Crudo → Pollo Asado, y solo en Sucursal B" vivía en prosa (CONTEXT.md §5.2)
-- y en la lógica. Nada en la base impedía una transformación absurda, y cambiar la regla
-- exigía desplegar código.

CREATE TABLE "TransformacionPermitida" (
    "id"              TEXT NOT NULL,
    "insumoOrigenId"  TEXT NOT NULL,
    "insumoDestinoId" TEXT NOT NULL,
    "sucursalId"      TEXT,             -- null = permitida en cualquier sucursal
    "factor"          DECIMAL(10,4) NOT NULL DEFAULT 1,
    "activo"          BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TransformacionPermitida_pkey" PRIMARY KEY ("id")
);

-- BD-12: una transformación circular no significa nada.
ALTER TABLE "TransformacionPermitida"
    ADD CONSTRAINT "TransformacionPermitida_no_circular"
    CHECK ("insumoOrigenId" <> "insumoDestinoId");

CREATE UNIQUE INDEX "TransformacionPermitida_origen_destino_sucursal_key"
    ON "TransformacionPermitida"("insumoOrigenId", "insumoDestinoId", "sucursalId");

ALTER TABLE "TransformacionPermitida" ADD CONSTRAINT "TransformacionPermitida_insumoOrigenId_fkey"
    FOREIGN KEY ("insumoOrigenId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransformacionPermitida" ADD CONSTRAINT "TransformacionPermitida_insumoDestinoId_fkey"
    FOREIGN KEY ("insumoDestinoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransformacionPermitida" ADD CONSTRAINT "TransformacionPermitida_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BD-12 (adelanto) · Invariantes que la base puede exigir y no exigía
-- ---------------------------------------------------------------------------
-- Un insumo duplicado dentro de una misma receta lo descontaría dos veces.
CREATE UNIQUE INDEX "IngredienteReceta_recetaId_insumoId_key"
    ON "IngredienteReceta"("recetaId", "insumoId");

-- Una transformación de un insumo en sí mismo, o un traslado de una sucursal a sí misma,
-- no significan nada.
ALTER TABLE "TransformacionInsumo"
    ADD CONSTRAINT "TransformacionInsumo_no_circular"
    CHECK ("insumoOrigenId" <> "insumoDestinoId");
ALTER TABLE "Traslado"
    ADD CONSTRAINT "Traslado_origen_distinto_destino"
    CHECK ("origenId" <> "destinoId");
