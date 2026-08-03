-- El conteo físico del efectivo y su diferencia contra el esperado se hacen FUERA del
-- sistema y ya no se registran. El corte solo conserva el esperado en caja (derivado) como
-- referencia. Se eliminan las columnas del cierre.
ALTER TABLE "CierreDia" DROP COLUMN "conteoFisico";
ALTER TABLE "CierreDia" DROP COLUMN "diferencia";
