-- Bloque 1 — fase BACKFILL.
--
-- Rellena las columnas que añadió la migración expand para los pedidos ya existentes.
-- Va en una migración separada del expand a propósito: si algo sale mal aquí, el
-- esquema ya está en su sitio y se puede repetir el backfill sin volver a tocar el DDL.

-- ---------------------------------------------------------------------------
-- BD-02 · fechaOperativa del histórico
-- ---------------------------------------------------------------------------
-- Se deriva de "creadoEn", que es la mejor aproximación disponible para pedidos
-- anteriores a este cambio. Equivale a lo que hace hoy rangoDiaUTC() en el servicio
-- de caja, así que NO altera ningún total histórico ya calculado.
--
-- ⚠️ LA DOBLE CONVERSIÓN NO ES OPCIONAL.
--
-- "creadoEn" es TIMESTAMP(3) SIN zona horaria y almacena UTC (ver BD-20).
--
--   AT TIME ZONE 'UTC'                -> declara que el valor naive ES UTC (da timestamptz)
--   AT TIME ZONE 'America/Mazatlan'   -> lo lleva a hora local        (da timestamp local)
--
-- Escribir solo `AT TIME ZONE 'America/Mazatlan'` —que es lo intuitivo— INTERPRETARÍA
-- el valor como si ya fuera hora local y convertiría en la dirección contraria,
-- desplazando todo 7 horas. Como el negocio vende de 12:00 a 17:00 (= 19:00-00:00 UTC),
-- eso mandaría buena parte de las ventas de la tarde al día siguiente.
UPDATE "Pedido"
SET "fechaOperativa" = ("creadoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mazatlan')::date
WHERE "fechaOperativa" IS NULL;

-- ---------------------------------------------------------------------------
-- BD-04 · catalogoVersion del histórico
-- ---------------------------------------------------------------------------
-- 0 = "pedido anterior al versionado de catálogo". No es la versión 1: distinguirlos
-- importa, porque de estos pedidos genuinamente no sabemos con qué precios se cotizaron.
UPDATE "Pedido"
SET "catalogoVersion" = 0
WHERE "catalogoVersion" IS NULL;
