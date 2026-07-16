-- BD-20 · Los timestamps pasan a llevar zona horaria.
--
-- PROBLEMA
-- Prisma mapea `DateTime` a `TIMESTAMP(3)` — SIN zona horaria. Todas las columnas de fecha
-- del sistema guardan UTC pero NO lo declaran: la base no sabe en qué zona está el valor
-- que almacena. Es una convención que vive solo en la cabeza del desarrollador.
--
-- Consecuencia práctica: cualquier SQL crudo que convierta a hora local necesita una DOBLE
-- conversión (`AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mazatlan'`). Escribir solo
-- `AT TIME ZONE 'America/Mazatlan'` —que es lo intuitivo y lo que parece correcto al
-- leerlo— convierte en la DIRECCIÓN CONTRARIA y desplaza todo 7 horas.
--
-- No es teórico. Ese error se cometió en la primera versión de la consulta de auditoría de
-- folios (BD-03): reportó 5 colisiones en días equivocados; la correcta reportaba 4. Y el
-- backfill de `fechaOperativa` lo tenía también — habría mandado al día siguiente buena
-- parte de las ventas de la tarde, que es cuando el negocio vende.
--
-- SOLUCIÓN
-- `timestamptz`. Postgres pasa a conocer el instante absoluto, y entonces
-- `AT TIME ZONE 'America/Mazatlan'` en un solo paso SÍ es correcto. Elimina la clase
-- entera de bug.
--
-- LA CLÁUSULA `USING` ES OBLIGATORIA
-- Sin ella, Postgres interpreta el valor naive como hora local del SERVIDOR (cuya zona
-- puede ser cualquiera) y desplaza todo el histórico en silencio. `AT TIME ZONE 'UTC'`
-- declara explícitamente lo que el valor ya era.
--
-- NO se tocan las columnas `@db.Date` (AperturaDia.fecha, CierreDia.fecha,
-- MovimientoCaja.fecha, Pedido.fechaOperativa, ...): un día de operación es un día
-- calendario, no un instante. DATE es el tipo correcto.

ALTER TABLE "Pedido"
    ALTER COLUMN "creadoEn"        TYPE TIMESTAMPTZ(3) USING "creadoEn"        AT TIME ZONE 'UTC',
    ALTER COLUMN "actualizadoEn"   TYPE TIMESTAMPTZ(3) USING "actualizadoEn"   AT TIME ZONE 'UTC',
    ALTER COLUMN "horaRecoleccion" TYPE TIMESTAMPTZ(3) USING "horaRecoleccion" AT TIME ZONE 'UTC',
    ALTER COLUMN "horaInicioPrep"  TYPE TIMESTAMPTZ(3) USING "horaInicioPrep"  AT TIME ZONE 'UTC',
    ALTER COLUMN "fechaReembolso"  TYPE TIMESTAMPTZ(3) USING "fechaReembolso"  AT TIME ZONE 'UTC';

ALTER TABLE "Cliente"
    ALTER COLUMN "creadoEn" TYPE TIMESTAMPTZ(3) USING "creadoEn" AT TIME ZONE 'UTC';

ALTER TABLE "InventarioInsumo"
    ALTER COLUMN "ultimoMovimiento" TYPE TIMESTAMPTZ(3) USING "ultimoMovimiento" AT TIME ZONE 'UTC';

ALTER TABLE "MovimientoInventario"
    ALTER COLUMN "fecha" TYPE TIMESTAMPTZ(3) USING "fecha" AT TIME ZONE 'UTC';

ALTER TABLE "TransformacionInsumo"
    ALTER COLUMN "fecha" TYPE TIMESTAMPTZ(3) USING "fecha" AT TIME ZONE 'UTC';

ALTER TABLE "Traslado"
    ALTER COLUMN "solicitadoEn" TYPE TIMESTAMPTZ(3) USING "solicitadoEn" AT TIME ZONE 'UTC',
    ALTER COLUMN "confirmadoEn" TYPE TIMESTAMPTZ(3) USING "confirmadoEn" AT TIME ZONE 'UTC';

ALTER TABLE "AperturaDia"
    ALTER COLUMN "abiertoEn" TYPE TIMESTAMPTZ(3) USING "abiertoEn" AT TIME ZONE 'UTC';

ALTER TABLE "MovimientoCaja"
    ALTER COLUMN "creadoEn" TYPE TIMESTAMPTZ(3) USING "creadoEn" AT TIME ZONE 'UTC';

ALTER TABLE "CierreDia"
    ALTER COLUMN "cerradoEn" TYPE TIMESTAMPTZ(3) USING "cerradoEn" AT TIME ZONE 'UTC';

ALTER TABLE "ConsumoEmpleado"
    ALTER COLUMN "fecha" TYPE TIMESTAMPTZ(3) USING "fecha" AT TIME ZONE 'UTC';

-- ---------------------------------------------------------------------------
-- BD-12 · Lo que faltaba de las invariantes
-- ---------------------------------------------------------------------------

-- El mismo corte no puede seleccionarse dos veces en el mismo ítem: las proporciones
-- dejarían de sumar 1.000 de forma coherente y el descuento se repartiría mal.
CREATE UNIQUE INDEX "SeleccionVariante_itemPedidoId_varianteId_key"
    ON "SeleccionVariante"("itemPedidoId", "varianteId");

-- Una proporción fuera de (0, 1] no significa nada (RN-02).
ALTER TABLE "SeleccionVariante"
    ADD CONSTRAINT "SeleccionVariante_proporcion_valida"
    CHECK ("proporcion" > 0 AND "proporcion" <= 1);

-- Un cliente no puede tener dos direcciones "principales". Índice PARCIAL: la restricción
-- solo aplica a las que lo son.
CREATE UNIQUE INDEX "DireccionCliente_una_principal_por_cliente"
    ON "DireccionCliente"("clienteId") WHERE "esPrincipal";

-- Cantidades y montos que no pueden ser negativos ni cero.
ALTER TABLE "ItemPedido"
    ADD CONSTRAINT "ItemPedido_cantidad_positiva" CHECK ("cantidad" > 0),
    ADD CONSTRAINT "ItemPedido_precio_no_negativo" CHECK ("precioUnitario" >= 0);

ALTER TABLE "Pedido"
    ADD CONSTRAINT "Pedido_total_no_negativo" CHECK ("total" >= 0),
    ADD CONSTRAINT "Pedido_folio_positivo"    CHECK ("folio" > 0);

ALTER TABLE "MovimientoCaja"
    ADD CONSTRAINT "MovimientoCaja_monto_positivo" CHECK ("monto" > 0);

ALTER TABLE "AperturaDia"
    ADD CONSTRAINT "AperturaDia_fondo_no_negativo" CHECK ("fondoInicial" >= 0);

ALTER TABLE "CierreDia"
    ADD CONSTRAINT "CierreDia_conteo_no_negativo" CHECK ("conteoFisico" >= 0);

ALTER TABLE "ConsumoEmpleado"
    ADD CONSTRAINT "ConsumoEmpleado_cantidad_positiva" CHECK ("cantidad" > 0);

ALTER TABLE "Traslado"
    ADD CONSTRAINT "Traslado_cantidad_positiva" CHECK ("cantidad" > 0);

ALTER TABLE "TransformacionInsumo"
    ADD CONSTRAINT "TransformacionInsumo_cantidades_positivas"
    CHECK ("cantidadOrigen" > 0 AND "cantidadDestino" > 0);

-- El reembolso: si el pedido está marcado como reembolsado, tiene que haber monto y fecha.
-- Y si no lo está, no puede haberlos. Antes, las tres columnas podían contradecirse.
ALTER TABLE "Pedido"
    ADD CONSTRAINT "Pedido_reembolso_coherente"
    CHECK (
        ("reembolsado" = false AND "montoReembolso" IS NULL AND "fechaReembolso" IS NULL)
        OR
        ("reembolsado" = true  AND "montoReembolso" IS NOT NULL AND "montoReembolso" >= 0
                              AND "fechaReembolso" IS NOT NULL)
    );
