-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('DUENO', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrigenPedido" AS ENUM ('MOSTRADOR', 'TELEFONO', 'WHATSAPP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "EstadoTraslado" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Unidad" AS ENUM ('KG', 'GR', 'LT', 'ML', 'PIEZA');

-- CreateEnum
CREATE TYPE "TipoInsumo" AS ENUM ('CARNE', 'POLLO', 'CONSUMIBLE', 'BEBIDA', 'COMPLEMENTO');

-- CreateTable
CREATE TABLE "Sucursal" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispositivo" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'DUENO',

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "requiereCorte" BOOLEAN NOT NULL DEFAULT false,
    "gramosBase" INTEGER,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoVariante" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grupoPrecio" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductoVariante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insumo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" "Unidad" NOT NULL,
    "tipo" "TipoInsumo" NOT NULL,
    "esDiario" BOOLEAN NOT NULL DEFAULT false,
    "rendimientoBolsa" DECIMAL(10,3),

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioInsumo" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "umbralAlerta" DECIMAL(10,3),
    "ultimoMovimiento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventarioInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receta" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,

    CONSTRAINT "Receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredienteReceta" (
    "id" TEXT NOT NULL,
    "recetaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "esVariable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "IngredienteReceta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransformacionInsumo" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "insumoOrigenId" TEXT NOT NULL,
    "insumoDestinoId" TEXT NOT NULL,
    "cantidadOrigen" DECIMAL(10,3) NOT NULL,
    "cantidadDestino" DECIMAL(10,3) NOT NULL,
    "tanda" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,

    CONSTRAINT "TransformacionInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "nombre" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DireccionCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "referencia" TEXT,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DireccionCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "dispositivoId" TEXT,
    "clienteId" TEXT,
    "origen" "OrigenPedido" NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "metodoPago" "MetodoPago",
    "total" DECIMAL(10,2) NOT NULL,
    "horaRecoleccion" TIMESTAMP(3),
    "horaInicioPrep" TIMESTAMP(3),
    "reembolsado" BOOLEAN NOT NULL DEFAULT false,
    "montoReembolso" DECIMAL(10,2),
    "fechaReembolso" TIMESTAMP(3),
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "notas" TEXT,

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeleccionVariante" (
    "id" TEXT NOT NULL,
    "itemPedidoId" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "proporcion" DECIMAL(4,3) NOT NULL DEFAULT 1.000,

    CONSTRAINT "SeleccionVariante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traslado" (
    "id" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "estado" "EstadoTraslado" NOT NULL DEFAULT 'PENDIENTE',
    "solicitadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoEn" TIMESTAMP(3),
    "notas" TEXT,

    CONSTRAINT "Traslado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AperturaDia" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "fondoInicial" DECIMAL(10,2) NOT NULL,
    "notas" TEXT,
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AperturaDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreDia" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "fondoInicial" DECIMAL(10,2) NOT NULL,
    "ventasEfectivo" DECIMAL(10,2) NOT NULL,
    "ventasTarjeta" DECIMAL(10,2) NOT NULL,
    "ventasTransfer" DECIMAL(10,2) NOT NULL,
    "totalVentas" DECIMAL(10,2) NOT NULL,
    "reembolsosEfectivo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "conteoFisico" DECIMAL(10,2) NOT NULL,
    "diferencia" DECIMAL(10,2) NOT NULL,
    "mermaPollo" INTEGER,
    "notas" TEXT,
    "cerradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoDia" (
    "id" TEXT NOT NULL,
    "cierreDiaId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fotoTicket" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastoDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BolsaSobrante" (
    "id" TEXT NOT NULL,
    "cierreDiaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "peso" DECIMAL(6,3) NOT NULL,

    CONSTRAINT "BolsaSobrante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoEmpleado" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,

    CONSTRAINT "ConsumoEmpleado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_token_key" ON "Dispositivo"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioInsumo_sucursalId_insumoId_key" ON "InventarioInsumo"("sucursalId", "insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "Receta_productoId_key" ON "Receta"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_telefono_key" ON "Cliente"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "AperturaDia_sucursalId_fecha_key" ON "AperturaDia"("sucursalId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "CierreDia_sucursalId_fecha_key" ON "CierreDia"("sucursalId", "fecha");

-- AddForeignKey
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoVariante" ADD CONSTRAINT "ProductoVariante_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioInsumo" ADD CONSTRAINT "InventarioInsumo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioInsumo" ADD CONSTRAINT "InventarioInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredienteReceta" ADD CONSTRAINT "IngredienteReceta_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredienteReceta" ADD CONSTRAINT "IngredienteReceta_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransformacionInsumo" ADD CONSTRAINT "TransformacionInsumo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransformacionInsumo" ADD CONSTRAINT "TransformacionInsumo_insumoOrigenId_fkey" FOREIGN KEY ("insumoOrigenId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransformacionInsumo" ADD CONSTRAINT "TransformacionInsumo_insumoDestinoId_fkey" FOREIGN KEY ("insumoDestinoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DireccionCliente" ADD CONSTRAINT "DireccionCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeleccionVariante" ADD CONSTRAINT "SeleccionVariante_itemPedidoId_fkey" FOREIGN KEY ("itemPedidoId") REFERENCES "ItemPedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeleccionVariante" ADD CONSTRAINT "SeleccionVariante_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "ProductoVariante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AperturaDia" ADD CONSTRAINT "AperturaDia_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreDia" ADD CONSTRAINT "CierreDia_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoDia" ADD CONSTRAINT "GastoDia_cierreDiaId_fkey" FOREIGN KEY ("cierreDiaId") REFERENCES "CierreDia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BolsaSobrante" ADD CONSTRAINT "BolsaSobrante_cierreDiaId_fkey" FOREIGN KEY ("cierreDiaId") REFERENCES "CierreDia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BolsaSobrante" ADD CONSTRAINT "BolsaSobrante_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoEmpleado" ADD CONSTRAINT "ConsumoEmpleado_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoEmpleado" ADD CONSTRAINT "ConsumoEmpleado_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

