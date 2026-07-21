-- BD-21 · La variante de corte por fin sabe qué insumo consume.
--
-- PROBLEMA
-- `ProductoVariante` guardaba el nombre del corte ("Rib Eye") y su grupo de precio, pero
-- NADA lo ligaba al insumo "Carne Rib Eye". El seed incluso traía un campo `insumo` en sus
-- arreglos de cortes que nunca se escribía: dato muerto que aparentaba resolver esto.
--
-- La consecuencia no era cosmética. `IngredienteReceta.esVariable = true` significa "el
-- insumo real depende del corte elegido", y el descuento se reparte según
-- `SeleccionVariante.proporcion`. Pero al llegar el momento de descontar no había forma de
-- responder "¿de qué insumo?": la receta de los paquetes apunta a "Carne Diezmillo" como
-- placeholder para los seis cortes. Un paquete vendido con Rib Eye habría descontado
-- diezmillo. Con el Grupo 3 recién agregado, uno de puerco también.
--
-- Es decir: el descuento de inventario por corte (RN-04, Fase 2) era inimplementable, y el
-- modelo no lo decía en ninguna parte.

-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------
ALTER TABLE "ProductoVariante" ADD COLUMN "insumoId" TEXT;

ALTER TABLE "ProductoVariante" ADD CONSTRAINT "ProductoVariante_insumoId_fkey"
    FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ProductoVariante_insumoId_idx" ON "ProductoVariante"("insumoId");

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------
-- El mapeo va por NOMBRE del insumo, no por id: los ids se derivan del nombre en el seed
-- ("Carne Cabrería" → "insumo-carne-cabrer-a") y depender de esa transformación aquí sería
-- frágil. El mapeo es explícito porque no es mecánico: "Puerco" es "Carne de Puerco", no
-- "Carne Puerco".
UPDATE "ProductoVariante" v
SET "insumoId" = i."id"
FROM "Insumo" i,
     (VALUES
        ('Diezmillo',  'Carne Diezmillo'),
        ('Sirloin',    'Carne Sirloin'),
        ('New York',   'Carne New York'),
        ('Cabrería',   'Carne Cabrería'),
        ('Rib Eye',    'Carne Rib Eye'),
        ('Puerco',     'Carne de Puerco')
     ) AS mapa(corte, insumo)
WHERE v."nombre" = mapa.corte
  AND i."nombre" = mapa.insumo;

-- ---------------------------------------------------------------------------
-- 3. La invariante, en la base
-- ---------------------------------------------------------------------------
-- No se puede exigir `insumoId NOT NULL` a secas: una variante que no sea un corte (un
-- tamaño de bebida) legítimamente no consume un insumo propio. Lo que sí es siempre cierto
-- es que un CORTE consume un insumo. Eso es lo que se enforza.
--
-- Sin este CHECK, insertar un corte sin insumo sería posible y el error solo aparecería en
-- Fase 2, al descontar: silencioso hasta que el inventario estuviera mal.
ALTER TABLE "ProductoVariante"
    ADD CONSTRAINT "ProductoVariante_corte_requiere_insumo"
    CHECK ("grupoCorteId" IS NULL OR "insumoId" IS NOT NULL);
