-- BD-03 · Unicidad de folio.
--
-- Se crea AHORA y no en la fase contract a propósito.
--
-- En Postgres, dos NULL se consideran distintos dentro de un índice único. Los pedidos
-- que escriba un backend anterior a este cambio llevan "fechaOperativa" NULL, así que
-- caen todos en la parte "distinta" del índice y NO chocan entre sí. Es decir: este
-- índice es compatible hacia atrás y puede convivir con el backend viejo.
--
-- Adelantarlo significa que la protección contra folios duplicados —el fallo que la
-- auditoría demostró que YA ocurrió en esta base— empieza a valer desde este despliegue,
-- sin esperar a la fase contract.
--
-- La fase contract solo tendrá que hacer SET NOT NULL sobre "fechaOperativa".
CREATE UNIQUE INDEX "Pedido_sucursalId_fechaOperativa_folio_key"
    ON "Pedido"("sucursalId", "fechaOperativa", "folio");
