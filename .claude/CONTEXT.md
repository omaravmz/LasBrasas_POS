# CONTEXT.md — Las Brasas POS
## Documento de contexto del proyecto para agentes de IA

> Este documento es la fuente de verdad del proyecto. Contiene todas las decisiones de arquitectura, modelo de datos, reglas de negocio y contexto operativo necesarios para desarrollar el sistema sin replanear. No tomar decisiones de diseño que contradigan lo aquí descrito sin revisión explícita. Acompaña a `SRS.md` (requerimientos funcionales y no funcionales).

---

## 1. Contexto del negocio

**Las Brasas** es un asadero estilo sinaloense ubicado en Culiacán, Sinaloa, México. Opera con **dos sucursales** (Sucursal A y Sucursal B) dedicadas exclusivamente a venta para llevar (no hay servicio de mesa).

### Horarios
- Producción (solo Sucursal A): 9:00 am – 12:00 pm
- Venta al público (ambas sucursales): 12:00 pm – 5:00 pm
- Se trabaja todos los días

### Relación entre sucursales
Las sucursales **no son independientes**, operan como un sistema coordinado:

- **Sucursal A**: centro de producción matutina. Aquí se marinan carnes, se preparan salsas, verduras, sopas frías.
- **Sucursal B**: tiene el único asadero/horno de pollos. Todos los pollos se asan aquí. Una parte se traslada a Sucursal A.
- A lo largo del día, los pollos se trasladan entre sucursales según demanda, inventario y hora.
- La carne asada y los demás alimentos se manejan de forma independiente en cada sucursal. Los traslados de carne entre sucursales son casos aislados, no forman parte del proceso oficial.

### Menú completo

#### Carne Asada
Cada paquete incluye tortillas de maíz, salsa, cebolla asada, chiles toreados y frijoles de la olla.

| Paquete | Carne asada | Tortillas | Frijoles |
|---|---|---|---|
| Individual | 180 gr | ¼ kg | ½ lt |
| 2 personas | 330 gr | ½ kg | ½ lt |
| 3 personas | 500 gr | ½ kg | ½ lt |
| 4 personas | 630 gr | ½ kg | ½ lt |
| 5 personas | 750 gr | ½ kg | ½ lt |
| 6 personas | 1,000 gr | 1 kg | 1 lt |

**Cortes y grupos de precio:**
- **Grupo 1**: Diezmillo, Sirloin, New York (mismo precio, mezclables entre sí)
- **Grupo 2**: Cabrería, Rib Eye (mismo precio, mezclables entre sí)
- **Puerco**: aparte, sobre pedido con tiempo estimado

Regla de mezcla: en un paquete el cliente puede elegir uno o más cortes **del mismo grupo de precio**. No se mezclan cortes de grupos distintos.

> **Carne cruda por paquete**: cada paquete tiene asociada una cantidad fija de carne *cruda* (no calculada, es un dato directo de la receta). Ejemplo: el paquete de 6 personas (1 kg asado) consume 1.5 kg de carne cruda. El valor exacto por paquete lo define el negocio. El descuento de inventario usa esa cantidad fija.

#### Pollos Asados
Cada paquete incluye tortillas, lechuga, cebolla curtida y salsa.

| Paquete | Tortillas |
|---|---|
| ¼ de pollo | ¼ kg |
| ½ pollo | ½ kg |
| ¾ de pollo | ½ kg |
| Pollo entero | ½ kg |

#### Promociones de Piezas (pierna y muslo)
Las piezas llegan **crudas** a Sucursal B y se asan ahí. Se manejan por paquetes de 8 piezas como unidad base. Son un insumo independiente de los pollos enteros.

| Paquete | Contenido |
|---|---|
| 8 piezas | 8 piezas + ½ kg tortillas + lechuga + cebolla curtida + salsa + 350 gr papas + ½ lt sopa fría |
| 4 piezas | 4 piezas + ½ kg tortillas + lechuga + cebolla curtida + salsa + 175 gr papas + ¼ lt sopa fría |

#### Otros alimentos
- **Tortas de carne asada**: con queso derretido y guacamole, incluyen salsa y consomé. Sencillas o con papas.
- **Boneless de pollo**: incluyen papas a la francesa y aderezo a elegir (Ranch, BBQ, Buffalo).
- **Tenders de pollo**: incluyen papas a la francesa y aderezo a elegir (Ranch, BBQ, Buffalo).

#### Extras
Extra de frijoles, tortillas, cebolla asada, verdura (lechuga y cebolla curtida), salsa, chiles toreados, papas a la francesa, guacamoles, totopos, sopas frías.

#### Bebidas
- Aguas de sabor: 1 lt
- Refrescos (Coca-Cola): 600 ml, 1 lt, 2 lt, 3 lt
- Té: 600 ml, 1 lt

---

## 2. Decisiones de arquitectura

### 2.1 Arquitectura general
**Backend en la nube + terminal POS con capacidad offline real.**

Un único backend en la nube sirve a ambas sucursales. No hay servidores locales. La terminal POS es una aplicación con **base de datos local y motor de sincronización**: puede operar de forma autónoma sin internet y reconcilia con la nube al recuperar conexión. Además, cada sucursal tiene un **router con failover automático a 4G/5G** como primera línea de defensa ante cortes.

### 2.1.1 Arquitectura offline — principio rector

**Todo lo que es local a una sucursal funciona 100% sin internet. Lo que es inherentemente entre-sucursales requiere conexión y se degrada con aviso claro al usuario.**

**Funciona completamente offline** (datos de los que la sucursal es dueña exclusiva):
- Registrar ventas (mostrador y telefónicas)
- Cobrar e imprimir tickets
- Cancelaciones y reembolsos
- Descuento de inventario por venta
- Registrar entradas de inventario
- Transformaciones de pollo (locales a Sucursal B)
- Corte de caja y cierre del día

**Requiere internet, se degrada sin conexión** (datos compartidos entre sucursales):
- Ver el inventario de pollos de la otra sucursal en tiempo real
- Registrar y confirmar traslados entre sucursales
- Dashboard del dueño y reportes
- Bot de WhatsApp

Cuando no hay internet y se necesita coordinar pollos, el personal se coordina por teléfono (como hoy) y registra el traslado en el sistema al volver la conexión.

**Implicaciones técnicas:**
- La terminal POS mantiene localmente (IndexedDB): catálogo, recetas, inventario propio, pedidos del día.
- El backend expone una **capa de sincronización**: endpoints que reciben lotes de operaciones hechas offline, las validan y devuelven el estado actualizado.
- Todos los IDs son UUID generados en el cliente — esto evita duplicados al sincronizar.
- El folio lo lleva un contador local de la terminal. Como hay **una sola terminal POS por sucursal de forma definitiva**, el servidor confía en ese contador sin riesgo de colisión.

### 2.2 Hardware por sucursal
- **1 terminal Android touchscreen** (Sunmi T2 o equivalente con impresora térmica integrada)
- **1 impresora térmica integrada** — imprime 2 tickets por pedido: cliente y producción
- **1 router con failover 4G/5G**

### 2.3 Usuarios del sistema
- **Dueño / Administrador**: cuenta individual con email y contraseña. Acceso a dashboard y gestión remota vía app móvil. Visibilidad de ambas sucursales.
- **Terminal POS de sucursal**: cada terminal tiene un **token de dispositivo** asignado a una sucursal. Los empleados (cajeros, encargados) no tienen cuentas individuales — comparten el acceso de la terminal. El sistema identifica la sucursal por el token. No se rastrean operaciones por empleado individual.

### 2.4 Pedidos remotos — DECISIÓN FINAL
- **WhatsApp**: un **número central** con **bot automatizado** (WhatsApp Cloud API de Meta). El cliente arma su pedido por flujo guiado, elige sucursal y hora de recolección. El pedido llega estructurado al sistema y se asigna a la sucursal elegida (origen `WHATSAPP`).
- **Llamadas telefónicas**: cada sucursal tiene su propio número telefónico. El personal de la sucursal captura el pedido en la terminal POS (origen `TELEFONO`).

---

## 3. Stack tecnológico

### Backend
| Componente | Tecnología |
|---|---|
| Runtime | Node.js |
| Framework | Express + TypeScript |
| ORM | Prisma |
| Autenticación | JWT + refresh tokens |
| Sincronización | Capa de sync: endpoints que reciben lotes de operaciones offline, las validan y devuelven el estado actualizado |

### Base de datos e infraestructura
| Componente | Tecnología |
|---|---|
| Base de datos | PostgreSQL en Supabase |
| Tiempo real | Supabase Realtime |
| Storage | Supabase Storage (fotos de tickets de gastos) |
| Deploy backend | Railway o Render |

> Prisma maneja el modelo, migraciones y lógica de negocio en el backend. Supabase Realtime maneja las suscripciones en tiempo real desde el cliente.

### Frontend POS (terminal en sucursal)
| Componente | Tecnología |
|---|---|
| Framework | React + TypeScript (PWA) |
| Base de datos local | IndexedDB (catálogo, recetas, inventario, pedidos del día) |
| Sincronización | Motor de sync propio contra la capa de sincronización del backend |
| Empaquetado Android | WebView nativa con puente JS ↔ Kotlin para impresión (~50 líneas) |
| Hardware | Sunmi T2 o equivalente |

> La terminal opera de forma autónoma sin internet para todas las funciones locales (ver sección 2.1.1) y reconcilia con la nube al recuperar conexión.

### App del dueño
| Componente | Tecnología |
|---|---|
| Framework | React Native + TypeScript |
| Plataforma | Android |

### Pedidos remotos
| Módulo | Tecnología |
|---|---|
| Bot WhatsApp | WhatsApp Cloud API (Meta) + webhook en backend Node.js |

---

## 4. Modelo de datos (Prisma Schema)

### 4.1 Estructura base

```prisma
model Sucursal {
  id     String @id @default(uuid())
  nombre String // "Sucursal A", "Sucursal B"

  dispositivos      Dispositivo[]
  pedidos           Pedido[]
  inventarioInsumos InventarioInsumo[]
  trasladosOrigen   Traslado[] @relation("TrasladoOrigen")
  trasladosDestino  Traslado[] @relation("TrasladoDestino")
  transformaciones  TransformacionInsumo[]
  consumosEmpleado  ConsumoEmpleado[]
  cierresDia        CierreDia[]
  aperturasDia      AperturaDia[]
}

// Token de dispositivo por terminal POS. Los empleados no tienen cuentas
// individuales — la terminal es la "sesión" de la sucursal.
model Dispositivo {
  id         String  @id @default(uuid())
  sucursalId String
  nombre     String  // "POS Sucursal A"
  token      String  @unique
  activo     Boolean @default(true)

  sucursal Sucursal @relation(fields: [sucursalId], references: [id])
  pedidos  Pedido[]
}

// Solo para dueño / administradores. Los cajeros usan el token del dispositivo.
model Usuario {
  id           String     @id @default(uuid())
  email        String     @unique
  passwordHash String
  nombre       String
  rol          RolUsuario @default(DUENO)
}

enum RolUsuario {
  DUENO
  ADMIN
}
```

### 4.2 Catálogo / Menú

```prisma
model Categoria {
  id     String @id @default(uuid())
  nombre String // "Carne Asada", "Pollos", "Tortas", "Bebidas", "Extras"
  orden  Int

  productos Producto[]
}

model Producto {
  id            String  @id @default(uuid())
  categoriaId   String
  nombre        String
  descripcion   String?
  precio        Decimal @db.Decimal(10, 2)
  activo        Boolean @default(true)
  // true solo para paquetes de carne — activa el selector de cortes
  requiereCorte Boolean @default(false)
  // gramos de carne ASADA del paquete — solo paquetes de carne
  gramosBase    Int?
  // orden de aparición dentro de su categoría en el POS
  orden         Int

  categoria   Categoria          @relation(fields: [categoriaId], references: [id])
  variantes   ProductoVariante[]
  receta      Receta?
  itemsPedido ItemPedido[]
  consumos    ConsumoEmpleado[]
}

// Opciones seleccionables: cortes de carne, aderezos, tamaños de bebida.
model ProductoVariante {
  id          String  @id @default(uuid())
  productoId  String
  nombre      String
  // Solo cortes de carne: 1 = Diezmillo/Sirloin/NY, 2 = Cabrería/Rib Eye
  grupoPrecio Int?
  activo      Boolean @default(true)

  producto    Producto            @relation(fields: [productoId], references: [id])
  selecciones SeleccionVariante[]
}
```

### 4.3 Inventario: Insumos y Recetas

```prisma
model Insumo {
  id     String     @id @default(uuid())
  nombre String
  unidad Unidad
  tipo   TipoInsumo

  // true: inventario diario, se reinicia cada día (tortillas).
  //       El sobrante al cierre se considera merma, no pasa al día siguiente.
  // false: inventario persistente entre días (refrescos, papas, etc.).
  esDiario Boolean @default(false)

  // Cantidad que rinde una unidad de compra (bolsa), en la unidad del insumo.
  // Ej: bolsa de papas = 1750 gr (rinde 5 órdenes de 350 gr).
  // Se usa para registrar entradas en bolsas y mostrar el inventario en bolsas.
  // Null si el insumo no se compra por bolsa.
  rendimientoBolsa Decimal? @db.Decimal(10, 3)

  ingredientesReceta      IngredienteReceta[]
  inventarios             InventarioInsumo[]
  transformacionesOrigen  TransformacionInsumo[] @relation("InsumoOrigen")
  transformacionesDestino TransformacionInsumo[] @relation("InsumoDestino")
  traslados               Traslado[]
  bolsasSobrantes         BolsaSobrante[]
}

enum Unidad {
  KG
  GR
  LT
  ML
  PIEZA
}

enum TipoInsumo {
  CARNE
  POLLO
  CONSUMIBLE  // tortillas, frijoles, salsas
  BEBIDA
  COMPLEMENTO // papas, boneless, tenders, aderezos
}

// Una fila por combinación sucursal-insumo. Inventario contable en tiempo real.
model InventarioInsumo {
  id               String   @id @default(uuid())
  sucursalId       String
  insumoId         String
  cantidad         Decimal  @db.Decimal(10, 3)
  umbralAlerta     Decimal? @db.Decimal(10, 3)
  ultimoMovimiento DateTime @default(now())

  sucursal Sucursal @relation(fields: [sucursalId], references: [id])
  insumo   Insumo   @relation(fields: [insumoId], references: [id])

  @@unique([sucursalId, insumoId])
}

// Una receta por producto. Define qué insumos consume al venderse.
model Receta {
  id         String @id @default(uuid())
  productoId String @unique

  producto     Producto            @relation(fields: [productoId], references: [id])
  ingredientes IngredienteReceta[]
}

model IngredienteReceta {
  id       String  @id @default(uuid())
  recetaId String
  insumoId String
  cantidad Decimal @db.Decimal(10, 3)
  // La unidad se toma del Insumo asociado (Insumo.unidad), no se duplica aquí.
  // true si el insumo depende de la variante elegida (ej. tipo de corte).
  // El descuento se reparte según SeleccionVariante.proporcion.
  esVariable Boolean @default(false)

  receta Receta @relation(fields: [recetaId], references: [id])
  insumo Insumo @relation(fields: [insumoId], references: [id])
}

// Conversión entre estados de un insumo. Uso: Pollo Crudo → Pollo Asado y
// Paquete Piezas Crudo → Paquete Piezas Asado. Solo en Sucursal B.
model TransformacionInsumo {
  id              String   @id @default(uuid())
  sucursalId      String
  insumoOrigenId  String
  insumoDestinoId String
  cantidadOrigen  Decimal  @db.Decimal(10, 3)
  cantidadDestino Decimal  @db.Decimal(10, 3)
  tanda           Int?     // número de tanda del día
  fecha           DateTime @default(now())
  notas           String?

  sucursal      Sucursal @relation(fields: [sucursalId], references: [id])
  insumoOrigen  Insumo   @relation("InsumoOrigen",  fields: [insumoOrigenId],  references: [id])
  insumoDestino Insumo   @relation("InsumoDestino", fields: [insumoDestinoId], references: [id])
}
```

> **Nota sobre bolsas físicas**: el sistema NO rastrea bolsas individuales con ciclo de vida. La carne, papas, boneless y tenders se manejan por inventario contable (`InventarioInsumo`). La única traza física es `BolsaSobrante` (ver 4.7), que registra el desglose de carne sobrante en el cierre del día.

### 4.4 Clientes

```prisma
model Cliente {
  id       String   @id @default(uuid())
  telefono String   @unique
  nombre   String?
  creadoEn DateTime @default(now())

  direcciones DireccionCliente[]
  pedidos     Pedido[]
}

model DireccionCliente {
  id          String  @id @default(uuid())
  clienteId   String
  direccion   String
  referencia  String?
  esPrincipal Boolean @default(false)

  cliente Cliente @relation(fields: [clienteId], references: [id])
}
```

### 4.5 Pedidos

```prisma
model Pedido {
  id              String       @id @default(uuid())
  // Folio: contador diario por sucursal (1, 2, 3...). Se reinicia cada día.
  // Se asigna de forma atómica al crear el pedido.
  folio           Int
  sucursalId      String
  dispositivoId   String?
  clienteId       String?      // null en ventas directas sin registro
  origen          OrigenPedido
  estado          EstadoPedido @default(PENDIENTE)
  metodoPago      MetodoPago?
  total           Decimal      @db.Decimal(10, 2)
  horaRecoleccion DateTime?    // pedidos programados
  horaInicioPrep  DateTime?    // calculado por timing inverso
  // Campos de reembolso (cancelación de pedido ya cobrado)
  reembolsado     Boolean      @default(false)
  montoReembolso  Decimal?     @db.Decimal(10, 2)
  fechaReembolso  DateTime?
  notas           String?
  creadoEn        DateTime     @default(now())
  actualizadoEn   DateTime     @updatedAt

  sucursal    Sucursal     @relation(fields: [sucursalId], references: [id])
  dispositivo Dispositivo? @relation(fields: [dispositivoId], references: [id])
  cliente     Cliente?     @relation(fields: [clienteId], references: [id])
  items       ItemPedido[]
}

model ItemPedido {
  id             String  @id @default(uuid())
  pedidoId       String
  productoId     String
  cantidad       Int
  precioUnitario Decimal @db.Decimal(10, 2)
  notas          String?

  pedido      Pedido              @relation(fields: [pedidoId], references: [id])
  producto    Producto            @relation(fields: [productoId], references: [id])
  selecciones SeleccionVariante[]
}

// Variantes elegidas para un item. Para paquetes de carne con mezcla de
// cortes, puede haber varias selecciones; la suma de proporciones = 1.000.
model SeleccionVariante {
  id           String  @id @default(uuid())
  itemPedidoId String
  varianteId   String
  proporcion   Decimal @db.Decimal(4, 3) @default(1.000)

  itemPedido ItemPedido       @relation(fields: [itemPedidoId], references: [id])
  variante   ProductoVariante @relation(fields: [varianteId], references: [id])
}

enum OrigenPedido {
  MOSTRADOR
  TELEFONO
  WHATSAPP
  DELIVERY
}

enum EstadoPedido {
  PENDIENTE
  LISTO
  ENTREGADO
  CANCELADO
}

enum MetodoPago {
  EFECTIVO
  TARJETA
  TRANSFERENCIA
}
```

### 4.6 Traslados entre sucursales

```prisma
// Movimientos de insumos entre sucursales. Uso principal: pollos asados y
// paquetes de piezas de Sucursal B → A.
// Flujo: origen registra el envío (PENDIENTE, descuenta su inventario) →
//        destino confirma (CONFIRMADO, incrementa su inventario).
model Traslado {
  id           String         @id @default(uuid())
  origenId     String
  destinoId    String
  insumoId     String
  cantidad     Decimal        @db.Decimal(10, 3)
  estado       EstadoTraslado @default(PENDIENTE)
  solicitadoEn DateTime       @default(now())
  confirmadoEn DateTime?
  notas        String?

  origen  Sucursal @relation("TrasladoOrigen",  fields: [origenId],  references: [id])
  destino Sucursal @relation("TrasladoDestino", fields: [destinoId], references: [id])
  insumo  Insumo   @relation(fields: [insumoId], references: [id])
}

enum EstadoTraslado {
  PENDIENTE
  CONFIRMADO
  CANCELADO
}
```

### 4.7 Operación diaria

```prisma
// Apertura del día: fondo de caja inicial y estado inicial de insumos diarios.
model AperturaDia {
  id           String   @id @default(uuid())
  sucursalId   String
  fecha        DateTime @db.Date
  fondoInicial Decimal  @db.Decimal(10, 2)
  notas        String?
  abiertoEn    DateTime @default(now())

  sucursal Sucursal @relation(fields: [sucursalId], references: [id])

  @@unique([sucursalId, fecha])
}

// Cierre del día: totales de venta, conciliación de caja, mermas.
model CierreDia {
  id             String   @id @default(uuid())
  sucursalId     String
  fecha          DateTime @db.Date
  fondoInicial   Decimal  @db.Decimal(10, 2)
  ventasEfectivo Decimal  @db.Decimal(10, 2)
  ventasTarjeta  Decimal  @db.Decimal(10, 2)
  ventasTransfer Decimal  @db.Decimal(10, 2)
  totalVentas    Decimal  @db.Decimal(10, 2)
  reembolsosEfectivo Decimal @db.Decimal(10, 2) @default(0)
  conteoFisico   Decimal  @db.Decimal(10, 2)
  // diferencia = conteoFisico - (fondoInicial + ventasEfectivo - reembolsosEfectivo)
  diferencia     Decimal  @db.Decimal(10, 2)
  mermaPollo     Int?
  notas          String?
  cerradoEn      DateTime @default(now())

  sucursal        Sucursal        @relation(fields: [sucursalId], references: [id])
  gastos          GastoDia[]
  bolsasSobrantes BolsaSobrante[]

  @@unique([sucursalId, fecha])
}

model GastoDia {
  id          String   @id @default(uuid())
  cierreDiaId String
  concepto    String
  monto       Decimal  @db.Decimal(10, 2)
  fotoTicket  String?  // URL en Supabase Storage
  creadoEn    DateTime @default(now())

  cierreDia CierreDia @relation(fields: [cierreDiaId], references: [id])
}

// Desglose por bolsa de la carne cruda sobrante al cierre del día.
// Es una línea de detalle del cierre, NO una entidad con ciclo de vida.
// La apertura del día siguiente lee estos registros del cierre anterior
// y los muestra como punto de partida (con su fecha de origen visible).
model BolsaSobrante {
  id          String  @id @default(uuid())
  cierreDiaId String
  insumoId    String  // qué corte de carne
  peso        Decimal @db.Decimal(6, 3) // kg de esa bolsa

  cierreDia CierreDia @relation(fields: [cierreDiaId], references: [id])
  insumo    Insumo    @relation(fields: [insumoId], references: [id])
}

// Comidas del personal. Cada empleado consume una comida diaria que descuenta
// inventario por receta pero NO genera ingreso ni afecta la caja.
// Se registran antes del cierre para que el conteo de insumos cuadre.
model ConsumoEmpleado {
  id          String   @id @default(uuid())
  sucursalId  String
  productoId  String   // el paquete/producto consumido
  cantidad    Int      @default(1)
  fecha       DateTime @default(now())
  notas       String?

  sucursal  Sucursal @relation(fields: [sucursalId], references: [id])
  producto  Producto @relation(fields: [productoId], references: [id])
}
```

---

## 5. Insumos y recetas de referencia (datos seed)

### 5.1 Insumos

| Nombre | Unidad | Tipo | esDiario | rendimientoBolsa |
|---|---|---|---|---|
| Carne Diezmillo | KG | CARNE | sí | — |
| Carne Sirloin | KG | CARNE | sí | — |
| Carne New York | KG | CARNE | sí | — |
| Carne Cabrería | KG | CARNE | sí | — |
| Carne Rib Eye | KG | CARNE | sí | — |
| Carne de Puerco | KG | CARNE | sí | — |
| Pollo Crudo | PIEZA | POLLO | sí | — |
| Pollo Asado | PIEZA | POLLO | sí | — |
| Paquete Piezas Crudo | PIEZA | POLLO | sí | — |
| Paquete Piezas Asado | PIEZA | POLLO | sí | — |
| Tortillas | KG | CONSUMIBLE | sí | — |
| Frijoles | LT | CONSUMIBLE | no | — |
| Salsa | PIEZA | CONSUMIBLE | no | — |
| Cebolla Asada | PIEZA | CONSUMIBLE | no | — |
| Chiles Toreados | PIEZA | CONSUMIBLE | no | — |
| Lechuga | PIEZA | CONSUMIBLE | no | — |
| Cebolla Curtida | PIEZA | CONSUMIBLE | no | — |
| Sopa Fría | LT | CONSUMIBLE | no | — |
| Papas a la Francesa | GR | COMPLEMENTO | no | 1750 |
| Boneless | GR | COMPLEMENTO | no | (definir) |
| Tenders | GR | COMPLEMENTO | no | (definir) |
| Guacamole | PIEZA | COMPLEMENTO | no | — |
| Totopos | PIEZA | COMPLEMENTO | no | — |
| Aderezo Ranch / BBQ / Buffalo | PIEZA | COMPLEMENTO | no | — |
| Refresco 600ml / 1lt / 2lt / 3lt | PIEZA | BEBIDA | no | — |
| Agua Sabor 1lt | PIEZA | BEBIDA | no | — |
| Té 600ml / 1lt | PIEZA | BEBIDA | no | — |

> Los insumos de carne y pollo se marcan `esDiario` porque su estado inicial se registra en la apertura. La carne sobrante se transfiere vía `BolsaSobrante`; el sistema la presenta en la apertura siguiente. Los valores de `rendimientoBolsa` de boneless y tenders los define el negocio.

### 5.2 Transformaciones permitidas (solo Sucursal B)

| Origen | Destino | Relación |
|---|---|---|
| Pollo Crudo | Pollo Asado | 1:1 |
| Paquete Piezas Crudo | Paquete Piezas Asado | 1:1 |

### 5.3 Recetas — notas clave

- **Paquetes de carne**: el ingrediente de carne es `esVariable = true`. La receta define la cantidad fija de carne **cruda** del paquete. Para mezclas de cortes, el descuento se reparte según `SeleccionVariante.proporcion`.
- **Papas como complemento**: orden completa de papas = 350 gr; papas dentro de torta/boneless/tenders = 175 gr. El descuento es en gramos; la conversión a bolsas es solo presentación (vía `rendimientoBolsa`).
- **Paquetes de piezas**: consumen `Paquete Piezas Asado` (1.0 para paquete de 8, 0.5 para paquete de 4).

---

## 6. Reglas de negocio críticas

Estas reglas se enforzan en la lógica del backend, no solo en el frontend.

| ID | Regla |
|---|---|
| RN-01 | En un paquete de carne, todos los cortes seleccionados deben ser del mismo grupo de precio. |
| RN-02 | La suma de proporciones de los cortes de un mismo item debe ser exactamente 1.000. |
| RN-03 | El folio se reinicia diariamente y es consecutivo por sucursal. Se asigna de forma atómica al crear el pedido (transacción). |
| RN-04 | Cancelar un pedido cobrado genera un reembolso por el monto pagado; afecta el corte de caja. |
| RN-05 | Cancelar un pedido revierte cualquier descuento de inventario aplicado. |
| RN-06 | Las transformaciones de pollo solo ocurren en Sucursal B. |
| RN-07 | El inventario de origen de un traslado se descuenta al registrarlo; el destino se incrementa al confirmarlo. |
| RN-08 | Solo existe una apertura y un cierre por sucursal por fecha. |
| RN-09 | El descuento de carne cruda usa la cantidad fija definida en la receta del paquete. |
| RN-10 | Los precios son iguales en ambas sucursales. |
| RN-11 | El descuento de inventario por venta es una transacción atómica: si un insumo es insuficiente, falla por completo. |
| RN-12 | Las comidas de empleados descuentan inventario por receta pero no generan ingreso ni afectan la caja. |
| RN-13 | Los insumos `esDiario` reinician su inventario cada día; el sobrante (excepto carne vía BolsaSobrante) es merma. |

---

## 7. Flujos operativos principales

### 7.1 Venta en mostrador
1. El cajero selecciona productos en el POS (organizados por categoría).
2. Para paquetes de carne, el POS muestra el selector de cortes filtrando por grupo de precio.
3. Se registra el método de pago y se cobra.
4. La terminal imprime 2 tickets: cliente y producción.
5. El backend asigna folio (atómico) y descuenta inventario en transacción atómica.
6. El pedido aparece como `PENDIENTE`, luego `LISTO`, luego `ENTREGADO`.

### 7.2 Cancelación de pedido
- **No cobrado**: pasa a `CANCELADO`; si tenía inventario descontado, se revierte.
- **Cobrado**: pasa a `CANCELADO`; se marca `reembolsado` con monto y fecha; se revierte inventario; el reembolso en efectivo se refleja en el cierre de caja.

### 7.3 Transformación de pollos (solo Sucursal B)
1. El asador informa al encargado cuántos pollos asó.
2. El encargado registra la transformación (Pollo Crudo → Pollo Asado, cantidad, tanda).
3. El sistema descuenta del insumo origen e incrementa el destino.

### 7.4 Traslado de pollos entre sucursales
1. El encargado registra el traslado: insumo, cantidad, destino. El inventario de origen se descuenta.
2. La sucursal destino ve la notificación en tiempo real.
3. Al recibir físicamente, el encargado de destino confirma; el inventario destino se incrementa.

### 7.5 Apertura del día
1. El encargado abre la pantalla de apertura.
2. Registra el fondo de caja inicial.
3. Registra el estado inicial de los insumos diarios (tortillas, pollos, carne). El sistema muestra automáticamente la carne sobrante del cierre anterior (`BolsaSobrante`) como punto de partida; el encargado suma lo nuevo que llegó.

### 7.6 Cierre del día
1. El cajero abre la pantalla de cierre a las 5:00 pm.
2. El sistema muestra los totales calculados: ventas por método de pago, reembolsos.
3. El cajero ingresa el conteo físico de caja; el sistema calcula la diferencia.
4. Se registran las comidas de empleados del día (si no se registraron antes).
5. Se registran los gastos del día (con foto de ticket opcional).
6. Se registra el desglose de carne sobrante por bolsa (`BolsaSobrante`).
7. El sistema muestra el consumo de tortillas del día (entradas vs ventas + comidas).
8. Se crea el `CierreDia` y se envía resumen automático al dueño.

### 7.7 Inventario de tortillas (insumo diario)
- Las tortillas se compran frescas cada mañana y se reabastecen durante el día.
- El inventario arranca en lo registrado en la apertura; las compras del día se registran como entradas.
- El dashboard muestra el inventario de tortillas en tiempo real para que el encargado anticipe compras.
- Al cierre, el sistema calcula automáticamente las tortillas consumidas.

### 7.8 Papas, boneless y tenders
- Se compran por bolsa; el inventario contable vive en gramos.
- La entrada se registra en bolsas y el sistema convierte a gramos vía `rendimientoBolsa`.
- El descuento por venta es en gramos según receta (orden completa 350 gr, complemento 175 gr).
- La visualización puede mostrar el equivalente en bolsas. No se rastrean bolsas individuales.

---

## 8. Funcionalidades por fase de implementación

Las fases son iteraciones secuenciales de trabajo. El sistema completo abarca las cuatro.

### Fase 1 — Núcleo del POS
Punto de venta, configurador de cortes, folios, cancelaciones, impresión de tickets, vista de pedidos básica, clientes básicos, corte de caja y conciliación, autenticación de terminal.

### Fase 2 — Inventario y Coordinación
Inventario de insumos, recetas, descuento automático, transformaciones de pollo, traslados entre sucursales, apertura del día, alertas de stock, comidas de empleados, inventario de tortillas.

### Fase 3 — Pedidos Remotos y Gestión del Dueño
Captura de pedidos telefónicos, pedidos programados con timing inverso, vistas extendidas de pedidos, dashboard móvil del dueño, módulo de proveedores, autenticación del dueño.

### Fase 4 — Automatización y Canales Digitales
Bot de WhatsApp con menú asistido, reportes automáticos por WhatsApp, integración con plataformas de delivery.

---

## 9. Convenciones de desarrollo

- **Lenguaje**: TypeScript estricto en todo el proyecto. Sin `any` explícito.
- **Nomenclatura**: modelos en singular. camelCase para variables y funciones. SCREAMING_SNAKE_CASE para enums.
- **IDs**: UUID v4 en todas las tablas.
- **Fechas**: UTC en la base de datos. El cliente convierte a hora local (America/Mazatlan, UTC-7).
- **Decimales**: tipo `Decimal` para precios, pesos y cantidades. Nunca `Float` para dinero.
- **Transacciones**: toda operación que modifique inventario y pedido a la vez usa `prisma.$transaction()`.
- **Errores**: respuestas de error estructuradas `{ code, message, details }`. Sin stack traces en producción.
- **Autenticación de terminal**: token de dispositivo en header `X-Device-Token`. El backend resuelve la sucursal desde ahí.
- **Autenticación de dueño**: JWT en header `Authorization: Bearer <token>`.

---

## 10. Consideraciones de implementación (prioridades de riesgo técnico)

El cuello de botella del sistema no es el rendimiento del stack (Node y PostgreSQL están sobrados para el volumen de dos sucursales). Los riesgos reales están en la operación. Orden de prioridad para invertir esfuerzo de arquitectura y pruebas:

1. **Sistema robusto de impresión**. Es el mayor riesgo de hardware y no tiene mitigante externo. Debe manejar estados de error (sin papel, impresora desconectada, atasco) y probarse en hardware real desde temprano. La impresión de ticket de cliente y comanda de producción es crítica en hora pico.

2. **Auditoría y corte de caja confiable**. Es el corazón del negocio y define la adopción: si el dueño no confía en la conciliación, el proyecto fracasa. La lógica de cálculo de cierre, reembolsos y conciliación debe ser impecable y bien probada.

3. **Integridad transaccional del descuento de inventario**. El descuento de insumos por receta al vender debe ser atómico (todo o nada). Un error aquí corrompe el inventario de forma silenciosa. Usar siempre `prisma.$transaction()`.

4. **Capacidad offline y sincronización**. Las funciones locales deben operar sin internet y reconciliar sin duplicar ni perder datos. La complejidad se acota porque los datos offline son propiedad exclusiva de cada sucursal (ver sección 2.1.1).

5. **Reportes multi-sucursal**. Importante para el dueño pero sin riesgo técnico: el modelo ya está segmentado por `sucursalId`, los reportes consolidados son casi triviales (`GROUP BY`). Sin prisa.

**No es prioridad**: un sistema robusto de roles y permisos. La arquitectura de autenticación ya lo resuelve — token de dispositivo para la terminal de sucursal, cuenta individual para el dueño. No se necesitan permisos granulares por empleado.

**No migrar el stack**: no hay razón para migrar a Go, Kotlin nativo u otras arquitecturas. El stack actual es suficiente; la complejidad debe invertirse en los puntos operativos de arriba.

---

## 11. Fuera de alcance (no implementar)

- Gestión de empleados individuales (turnos, nómina, permisos por persona)
- Historial de cambios de precio
- Programa de fidelización de clientes
- Facturación electrónica (CFDI)
- Traslados de carne entre sucursales (no son proceso oficial)
- Rastreo de bolsas individuales con ciclo de vida
- Control formal de caducidad de insumos

---

*Última actualización: mayo 2026. Documento generado a partir de sesión de diseño técnico completa. Todas las decisiones fueron discutidas y aprobadas con el desarrollador principal.*
