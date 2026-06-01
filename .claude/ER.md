# ER.md — Las Brasas POS
## Diagrama Entidad-Relación (descripción estructurada)

> Este documento describe el modelo entidad-relación del sistema en formato textual, optimizado para lectura por LLMs y humanos. Es la contraparte navegable del schema de Prisma en `CONTEXT.md` sección 4. Ante cualquier discrepancia, el schema de Prisma en `CONTEXT.md` es la fuente de verdad.

---

## 1. Convenciones

- **PK**: clave primaria. Todas son `UUID` generadas en cliente, salvo que se indique.
- **FK**: clave foránea.
- **Cardinalidad**: se expresa como `1 —— N` (uno a muchos), `1 —— 1` (uno a uno), `N —— N` (muchos a muchos).
- El lado `N` es el que contiene la FK.
- **(opcional)** indica que la FK admite `NULL`.

---

## 2. Entidades por dominio

### Dominio: Estructura base

#### Sucursal
Representa una de las dos sucursales del negocio.
- `id` (PK)
- `nombre` — "Sucursal A" / "Sucursal B"

#### Dispositivo
Terminal POS física. Se autentica por token; representa a la sucursal.
- `id` (PK)
- `sucursalId` (FK → Sucursal)
- `nombre` — ej. "POS Sucursal A"
- `token` (único) — token de autenticación del dispositivo
- `activo` (boolean)

#### Usuario
Solo para el dueño y administradores. Los cajeros NO tienen usuario.
- `id` (PK)
- `email` (único)
- `passwordHash`
- `nombre`
- `rol` — enum: `DUENO`, `ADMIN`

---

### Dominio: Catálogo / Menú

#### Categoria
Agrupación visual de productos en el POS.
- `id` (PK)
- `nombre` — "Carne Asada", "Pollos", "Tortas", "Bebidas", "Extras"
- `orden` (int) — orden de aparición

#### Producto
Un ítem vendible del menú.
- `id` (PK)
- `categoriaId` (FK → Categoria)
- `nombre`
- `descripcion` (opcional)
- `precio` (decimal)
- `activo` (boolean)
- `requiereCorte` (boolean) — true solo para paquetes de carne; activa el selector de cortes
- `gramosBase` (int, opcional) — gramos de carne asada del paquete; solo paquetes de carne
- `orden` (int) — orden dentro de su categoría

#### ProductoVariante
Opción seleccionable de un producto: corte de carne, aderezo, tamaño de bebida.
- `id` (PK)
- `productoId` (FK → Producto)
- `nombre` — ej. "Sirloin", "Ranch", "600ml"
- `grupoPrecio` (int, opcional) — solo cortes de carne: 1 o 2
- `activo` (boolean)

---

### Dominio: Inventario

#### Insumo
Materia prima o producto físico que se consume o transforma.
- `id` (PK)
- `nombre` — ej. "Carne Sirloin", "Pollo Asado", "Tortillas", "Papas a la Francesa"
- `unidad` — enum: `KG`, `GR`, `LT`, `ML`, `PIEZA`
- `tipo` — enum: `CARNE`, `POLLO`, `CONSUMIBLE`, `BEBIDA`, `COMPLEMENTO`
- `esDiario` (boolean) — true: inventario se reinicia cada día (tortillas); false: persiste entre días
- `rendimientoBolsa` (decimal, opcional) — cantidad que rinde una bolsa de compra (ej. papas: 1750 gr)

#### InventarioInsumo
Inventario contable de un insumo en una sucursal. Una fila por combinación sucursal-insumo.
- `id` (PK)
- `sucursalId` (FK → Sucursal)
- `insumoId` (FK → Insumo)
- `cantidad` (decimal)
- `umbralAlerta` (decimal, opcional) — dispara alerta de stock bajo
- `ultimoMovimiento` (datetime)
- **Restricción única**: (`sucursalId`, `insumoId`)

#### Receta
Definición de los insumos que consume un Producto al venderse. Una receta por producto.
- `id` (PK)
- `productoId` (FK → Producto, único)

#### IngredienteReceta
Una línea de una receta: un insumo y su cantidad.
- `id` (PK)
- `recetaId` (FK → Receta)
- `insumoId` (FK → Insumo)
- `cantidad` (decimal)
- `esVariable` (boolean) — true si el insumo depende de la variante elegida (ej. tipo de corte)
- **Nota**: la unidad de medida se toma del `Insumo` asociado; no se almacena en esta entidad para evitar redundancia.

#### TransformacionInsumo
Registro de la conversión de un insumo en otro (ej. Pollo Crudo → Pollo Asado). Solo en Sucursal B.
- `id` (PK)
- `sucursalId` (FK → Sucursal)
- `insumoOrigenId` (FK → Insumo)
- `insumoDestinoId` (FK → Insumo)
- `cantidadOrigen` (decimal)
- `cantidadDestino` (decimal)
- `tanda` (int, opcional) — número de tanda del día
- `fecha` (datetime)
- `notas` (opcional)

---

### Dominio: Clientes

#### Cliente
Consumidor registrado, identificado por teléfono.
- `id` (PK)
- `telefono` (único)
- `nombre` (opcional)
- `creadoEn` (datetime)

#### DireccionCliente
Dirección guardada de un cliente.
- `id` (PK)
- `clienteId` (FK → Cliente)
- `direccion`
- `referencia` (opcional)
- `esPrincipal` (boolean)

---

### Dominio: Pedidos

#### Pedido
Una orden de venta.
- `id` (PK)
- `folio` (int) — consecutivo diario por sucursal; se reinicia cada día
- `sucursalId` (FK → Sucursal)
- `dispositivoId` (FK → Dispositivo, opcional)
- `clienteId` (FK → Cliente, opcional) — null en venta directa sin registro
- `origen` — enum: `MOSTRADOR`, `TELEFONO`, `WHATSAPP`, `DELIVERY`
- `estado` — enum: `PENDIENTE`, `LISTO`, `ENTREGADO`, `CANCELADO`
- `metodoPago` — enum: `EFECTIVO`, `TARJETA`, `TRANSFERENCIA` (opcional hasta cobrar)
- `total` (decimal)
- `horaRecoleccion` (datetime, opcional) — pedidos programados
- `horaInicioPrep` (datetime, opcional) — calculado por timing inverso
- `reembolsado` (boolean)
- `montoReembolso` (decimal, opcional)
- `fechaReembolso` (datetime, opcional)
- `notas` (opcional)
- `creadoEn` (datetime)
- `actualizadoEn` (datetime)

#### ItemPedido
Una línea de un pedido: un producto y su cantidad.
- `id` (PK)
- `pedidoId` (FK → Pedido)
- `productoId` (FK → Producto)
- `cantidad` (int)
- `precioUnitario` (decimal) — precio al momento de la venta (histórico)
- `notas` (opcional)

#### SeleccionVariante
Variante elegida para un ItemPedido. Varias por ítem en caso de mezcla de cortes.
- `id` (PK)
- `itemPedidoId` (FK → ItemPedido)
- `varianteId` (FK → ProductoVariante)
- `proporcion` (decimal) — fracción del ítem; la suma por ítem debe ser 1.000

---

### Dominio: Coordinación entre sucursales

#### Traslado
Movimiento de un insumo de una sucursal a otra.
- `id` (PK)
- `origenId` (FK → Sucursal)
- `destinoId` (FK → Sucursal)
- `insumoId` (FK → Insumo)
- `cantidad` (decimal)
- `estado` — enum: `PENDIENTE`, `CONFIRMADO`, `CANCELADO`
- `solicitadoEn` (datetime)
- `confirmadoEn` (datetime, opcional)
- `notas` (opcional)

---

### Dominio: Operación diaria

#### AperturaDia
Registro de apertura de la jornada.
- `id` (PK)
- `sucursalId` (FK → Sucursal)
- `fecha` (date)
- `fondoInicial` (decimal)
- `notas` (opcional)
- `abiertoEn` (datetime)
- **Restricción única**: (`sucursalId`, `fecha`)

#### CierreDia
Registro de cierre de la jornada, con conciliación de caja.
- `id` (PK)
- `sucursalId` (FK → Sucursal)
- `fecha` (date)
- `fondoInicial` (decimal)
- `ventasEfectivo`, `ventasTarjeta`, `ventasTransfer` (decimal)
- `totalVentas` (decimal)
- `reembolsosEfectivo` (decimal)
- `conteoFisico` (decimal)
- `diferencia` (decimal) — calculada: `conteoFisico - (fondoInicial + ventasEfectivo - reembolsosEfectivo)`
- `mermaPollo` (int, opcional)
- `notas` (opcional)
- `cerradoEn` (datetime)
- **Restricción única**: (`sucursalId`, `fecha`)

#### GastoDia
Un gasto registrado en el cierre del día.
- `id` (PK)
- `cierreDiaId` (FK → CierreDia)
- `concepto`
- `monto` (decimal)
- `fotoTicket` (opcional) — URL en Supabase Storage
- `creadoEn` (datetime)

#### BolsaSobrante
Desglose por bolsa de la carne cruda sobrante al cierre. Línea de detalle del cierre, no entidad con ciclo de vida.
- `id` (PK)
- `cierreDiaId` (FK → CierreDia)
- `insumoId` (FK → Insumo) — qué corte de carne
- `peso` (decimal) — kg de esa bolsa

#### ConsumoEmpleado
Comida del personal. Descuenta inventario por receta; no genera ingreso ni afecta la caja.
- `id` (PK)
- `sucursalId` (FK → Sucursal)
- `productoId` (FK → Producto)
- `cantidad` (int)
- `fecha` (datetime)
- `notas` (opcional)

---

## 3. Relaciones (cardinalidades)

### Estructura base
- `Sucursal 1 —— N Dispositivo`
- `Sucursal 1 —— N Pedido`
- `Sucursal 1 —— N InventarioInsumo`
- `Sucursal 1 —— N TransformacionInsumo`
- `Sucursal 1 —— N ConsumoEmpleado`
- `Sucursal 1 —— N AperturaDia`
- `Sucursal 1 —— N CierreDia`
- `Sucursal 1 —— N Traslado` (como origen)
- `Sucursal 1 —— N Traslado` (como destino)

### Catálogo
- `Categoria 1 —— N Producto`
- `Producto 1 —— N ProductoVariante`
- `Producto 1 —— 1 Receta` (un producto tiene como máximo una receta)
- `Producto 1 —— N ItemPedido`
- `Producto 1 —— N ConsumoEmpleado`

### Inventario
- `Insumo 1 —— N InventarioInsumo`
- `Insumo 1 —— N IngredienteReceta`
- `Insumo 1 —— N TransformacionInsumo` (como origen)
- `Insumo 1 —— N TransformacionInsumo` (como destino)
- `Insumo 1 —— N Traslado`
- `Insumo 1 —— N BolsaSobrante`
- `Receta 1 —— N IngredienteReceta`

### Clientes
- `Cliente 1 —— N DireccionCliente`
- `Cliente 1 —— N Pedido`

### Pedidos
- `Pedido 1 —— N ItemPedido`
- `Dispositivo 1 —— N Pedido`
- `ItemPedido 1 —— N SeleccionVariante`
- `ProductoVariante 1 —— N SeleccionVariante`

### Operación diaria
- `CierreDia 1 —— N GastoDia`
- `CierreDia 1 —— N BolsaSobrante`

---

## 4. Notas de integridad y diseño

1. **Identidad de la sucursal en cada entidad operativa**: casi toda entidad transaccional (Pedido, InventarioInsumo, Traslado, CierreDia, etc.) referencia `Sucursal`. La segregación de datos por sucursal se hace filtrando por esta FK.

2. **Mezcla de cortes**: un `ItemPedido` de un paquete de carne puede tener varias `SeleccionVariante`. Todas deben apuntar a variantes del mismo `grupoPrecio` y la suma de `proporcion` debe ser exactamente 1.000.

3. **Recetas con ingredientes variables**: `IngredienteReceta.esVariable = true` indica que el insumo concreto se resuelve según la `SeleccionVariante` del ítem. Para carne, el descuento se reparte por `proporcion`.

4. **Inventario contable vs. traza física**: `InventarioInsumo` es el inventario contable (se descuenta por ventas). `BolsaSobrante` es la única traza física, y solo para carne sobrante al cierre. No existen entidades de "bolsa" con ciclo de vida.

5. **Transformaciones**: `TransformacionInsumo` conecta dos insumos distintos (origen y destino). Las únicas transformaciones válidas son Pollo Crudo → Pollo Asado y Paquete Piezas Crudo → Paquete Piezas Asado, y solo en Sucursal B.

6. **Traslado con doble relación a Sucursal**: `Traslado` referencia `Sucursal` dos veces (origen y destino). Requiere nombrar ambas relaciones en Prisma.

7. **Pedido y reembolso**: el reembolso no es una entidad separada; son campos en `Pedido` (`reembolsado`, `montoReembolso`, `fechaReembolso`). El reembolso en efectivo se refleja en `CierreDia.reembolsosEfectivo`.

8. **Unicidad temporal**: `AperturaDia` y `CierreDia` tienen restricción única (`sucursalId`, `fecha`): una sola apertura y un solo cierre por sucursal por día.

9. **Histórico de precios**: `ItemPedido.precioUnitario` guarda el precio al momento de la venta. Cambiar el precio de un `Producto` no altera pedidos pasados.

10. **Consumo de empleados**: `ConsumoEmpleado` referencia directamente un `Producto` (no pasa por `Pedido`). Descuenta inventario por la receta de ese producto.

---

## 5. Resumen de entidades

| # | Entidad | Dominio | Propósito |
|---|---|---|---|
| 1 | Sucursal | Base | Las dos sucursales del negocio |
| 2 | Dispositivo | Base | Terminal POS autenticada por token |
| 3 | Usuario | Base | Dueño y administradores |
| 4 | Categoria | Catálogo | Agrupación de productos |
| 5 | Producto | Catálogo | Ítem vendible del menú |
| 6 | ProductoVariante | Catálogo | Opción de un producto (corte, aderezo, tamaño) |
| 7 | Insumo | Inventario | Materia prima consumible o transformable |
| 8 | InventarioInsumo | Inventario | Inventario contable por sucursal |
| 9 | Receta | Inventario | Insumos que consume un producto |
| 10 | IngredienteReceta | Inventario | Línea de una receta |
| 11 | TransformacionInsumo | Inventario | Conversión entre insumos (pollo crudo→asado) |
| 12 | Cliente | Clientes | Consumidor registrado |
| 13 | DireccionCliente | Clientes | Dirección de un cliente |
| 14 | Pedido | Pedidos | Orden de venta |
| 15 | ItemPedido | Pedidos | Línea de un pedido |
| 16 | SeleccionVariante | Pedidos | Variante elegida para un ítem |
| 17 | Traslado | Coordinación | Movimiento de insumo entre sucursales |
| 18 | AperturaDia | Operación | Apertura de jornada |
| 19 | CierreDia | Operación | Cierre de jornada con conciliación |
| 20 | GastoDia | Operación | Gasto registrado en el cierre |
| 21 | BolsaSobrante | Operación | Desglose de carne sobrante al cierre |
| 22 | ConsumoEmpleado | Operación | Comida del personal |

Total: 22 entidades.

---

*Documento generado a partir del modelo de datos de Las Brasas POS. Complementa a `CONTEXT.md` (schema Prisma) y `SRS.md` (requerimientos).*
