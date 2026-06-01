# SRS — Las Brasas POS
## Documento de Especificación de Requerimientos de Software

> Este documento especifica los requerimientos funcionales y no funcionales del sistema completo. Acompaña a `CONTEXT.md` (contexto de negocio, arquitectura y modelo de datos). Cada requerimiento está etiquetado con su fase de implementación y su prioridad.

---

## 1. Introducción

### 1.1 Propósito
Especificar de forma completa y verificable los requerimientos del sistema de Punto de Venta y Gestión Integral de Las Brasas, para que sirva como referencia de desarrollo y como lista de verificación de alcance.

### 1.2 Alcance del sistema
El sistema reemplaza el POS actual del negocio y digitaliza sus procesos operativos y administrativos: venta, inventario, coordinación entre sucursales, registro diario, pedidos remotos y gestión remota del dueño. Opera en dos sucursales bajo una arquitectura en la nube.

### 1.3 Definiciones
- **Folio**: número consecutivo de pedido, reiniciado diariamente por sucursal.
- **Comanda**: ticket de producción, sin precios, para cocina/asadero.
- **Receta**: definición de insumos que consume un producto al venderse.
- **Insumo**: materia prima o producto físico consumible o transformable.
- **Traslado**: movimiento de inventario entre sucursales.
- **Transformación**: conversión de un insumo a otro estado (ej. pollo crudo a asado).
- **Merma**: producto perdido, desperdiciado o sobrante al cierre.
- **Conciliación**: verificación de que el dinero físico coincide con lo registrado.

### 1.4 Convención de identificadores
- `RF-XX-NN`: Requerimiento Funcional, módulo XX, número NN.
- `RNF-NN`: Requerimiento No Funcional.
- Prioridad: **Alta**, **Media**, **Baja**.
- Fase: 1, 2, 3 o 4 según el plan de iteraciones.

---

## 2. Actores del sistema

| Actor | Descripción |
|---|---|
| **Terminal POS** | La terminal de sucursal, autenticada por token de dispositivo. Operada por cajeros y encargados sin cuenta individual. Representa a la sucursal. |
| **Encargado** | Empleado que realiza operaciones administrativas en la terminal (apertura, cierre, inventario, traslados). No tiene cuenta separada; usa la terminal. |
| **Dueño** | Administrador del negocio. Cuenta individual con email y contraseña. Acceso a dashboard y gestión remota desde app móvil. |
| **Bot WhatsApp** | Componente automatizado que captura pedidos remotos vía WhatsApp Cloud API y los registra en el sistema. |
| **Cliente** | Consumidor final. Interactúa indirectamente: en mostrador, por llamada telefónica, o mediante el bot de WhatsApp. |

---

## 3. Requerimientos Funcionales

### 3.1 Módulo PV — Punto de Venta

**RF-PV-01 — Catálogo de productos en pantalla**
*Fase 1 · Prioridad Alta*
La terminal muestra los productos organizados por categoría. El orden de aparición de cada producto dentro de su categoría lo define el campo `orden`, configurable por el dueño.
*Criterio de aceptación*: el catálogo carga al iniciar la terminal; cada producto muestra nombre y precio; las categorías son navegables; los productos respetan el orden configurado.

**RF-PV-02 — Configurador de paquete de carne**
*Fase 1 · Prioridad Alta*
Al seleccionar un paquete de carne (`requiereCorte = true`), el sistema muestra los cortes disponibles agrupados por grupo de precio y permite elegir uno o varios del mismo grupo.
*Criterio de aceptación*: el sistema impide seleccionar cortes de grupos de precio distintos en un mismo paquete; la suma de proporciones de los cortes elegidos es 1.000.

**RF-PV-03 — Armado de pedido multi-producto**
*Fase 1 · Prioridad Alta*
Un pedido puede contener múltiples productos de distinta naturaleza (paquetes de carne, pollos, tortas, bebidas, extras).
*Criterio de aceptación*: el sistema calcula el total sumando precio unitario por cantidad de cada item.

**RF-PV-04 — Cobro y método de pago**
*Fase 1 · Prioridad Alta*
El cajero registra el método de pago (efectivo, tarjeta, transferencia) al cerrar la venta.
*Criterio de aceptación*: no se puede finalizar un pedido sin método de pago; el pedido queda asociado al método elegido.

**RF-PV-05 — Asignación automática de folio**
*Fase 1 · Prioridad Alta*
Al crear un pedido, el sistema le asigna un folio consecutivo dentro de su sucursal y fecha.
*Criterio de aceptación*: el primer pedido del día por sucursal recibe folio 1; folios consecutivos sin huecos; la asignación es atómica (dos pedidos simultáneos nunca reciben el mismo folio).

**RF-PV-06 — Reinicio diario de folios**
*Fase 1 · Prioridad Alta*
El folio se reinicia automáticamente cada día. El primer pedido de un nuevo día en cada sucursal vuelve a folio 1.
*Criterio de aceptación*: pedidos de fechas distintas tienen secuencias de folio independientes por sucursal.

**RF-PV-07 — Impresión de ticket de cliente**
*Fase 1 · Prioridad Alta*
Al cobrar, la terminal imprime un ticket para el cliente con productos, cantidades, precios, total, folio y sucursal.
*Criterio de aceptación*: el ticket de cliente incluye precios y el folio del pedido.

**RF-PV-08 — Impresión de comanda de producción**
*Fase 1 · Prioridad Alta*
Al cobrar, la terminal imprime una comanda de producción con formato grande, sin precios, solo con lo que debe prepararse.
*Criterio de aceptación*: la comanda no muestra precios; muestra folio y detalle de productos a preparar.

**RF-PV-09 — Indicación de disponibilidad de corte**
*Fase 1 · Prioridad Media*
El sistema permite marcar cortes como no disponibles en el momento (ej. Rib Eye no asado, puerco sobre pedido), mostrándolo al cajero.
*Criterio de aceptación*: un corte marcado no disponible se muestra distinguido en el configurador.

**RF-PV-10 — Cancelación de pedido no cobrado**
*Fase 1 · Prioridad Alta*
Un pedido aún no cobrado puede cancelarse. Pasa a estado `CANCELADO`.
*Criterio de aceptación*: el pedido cancelado no aparece en pedidos activos; si tenía inventario descontado, se revierte.

**RF-PV-11 — Cancelación de pedido cobrado con reembolso**
*Fase 1 · Prioridad Alta*
Un pedido ya cobrado puede cancelarse. Pasa a `CANCELADO`, se registra el reembolso por el monto pagado y se revierte el descuento de inventario.
*Criterio de aceptación*: el pedido queda marcado como reembolsado con monto y fecha; el reembolso se refleja en el corte de caja del día.

**RF-PV-12 — Interfaz táctil optimizada**
*Fase 1 · Prioridad Media*
La interfaz usa tipografía grande, botones amplios y diseño pensado para captura rápida en horas pico.
*Criterio de aceptación*: las acciones frecuentes se completan con el mínimo de toques posible.

**RF-PV-13 — Operación de venta offline**
*Fase 1 · Prioridad Alta*
La terminal POS puede registrar ventas, cobrar, imprimir, cancelar y reembolsar sin conexión a internet, usando su base de datos local. Las operaciones se sincronizan con la nube al recuperar la conexión.
*Criterio de aceptación*: una venta completa puede realizarse sin internet; al reconectar, la venta aparece en la nube sin duplicarse ni perderse.

**RF-PV-14 — Folio offline**
*Fase 1 · Prioridad Alta*
La terminal asigna folios de forma autónoma mediante un contador local, incluso sin conexión. Al haber una sola terminal por sucursal, no hay riesgo de colisión de folios.
*Criterio de aceptación*: los folios generados offline son consecutivos y se conservan al sincronizar.

### 3.2 Módulo PE — Gestión de Pedidos

**RF-PE-01 — Estados de pedido**
*Fase 1 · Prioridad Alta*
Un pedido transita por los estados: `PENDIENTE`, `LISTO`, `ENTREGADO`, `CANCELADO`.
*Criterio de aceptación*: las transiciones de estado son válidas y registradas; un pedido entregado o cancelado no vuelve a estados anteriores.

**RF-PE-02 — Vista de pedidos activos**
*Fase 1 · Prioridad Alta*
La terminal muestra los pedidos activos de la sucursal organizados por estado.
*Criterio de aceptación*: los pedidos se mueven entre vistas conforme cambia su estado; ningún pedido activo queda oculto.

**RF-PE-03 — Vistas extendidas de pedidos**
*Fase 3 · Prioridad Alta*
El sistema muestra cuatro vistas: Próximos (programados sin iniciar), En preparación, Listos, En ruta.
*Criterio de aceptación*: cada pedido aparece en la vista correspondiente a su estado; las vistas se actualizan en tiempo real.

**RF-PE-04 — Pedidos programados**
*Fase 3 · Prioridad Alta*
Un pedido puede registrarse con una hora de recolección futura.
*Criterio de aceptación*: el pedido programado aparece en la vista de Próximos hasta que llega su hora de preparación.

**RF-PE-05 — Timing inverso**
*Fase 3 · Prioridad Alta*
El sistema calcula la hora a la que debe iniciar la preparación de un pedido programado, restando los tiempos típicos de preparación a la hora de recolección.
*Criterio de aceptación*: a la hora calculada, el pedido pasa a preparación y se imprime la comanda.

**RF-PE-06 — Actualización en tiempo real**
*Fase 1 · Prioridad Alta*
Los cambios de estado de pedidos se reflejan en tiempo real en las pantallas correspondientes.
*Criterio de aceptación*: un cambio de estado se ve reflejado sin necesidad de recargar la vista.

### 3.3 Módulo CL — Clientes

**RF-CL-01 — Registro de clientes**
*Fase 1 · Prioridad Media*
El sistema almacena clientes con teléfono, nombre opcional y direcciones.
*Criterio de aceptación*: un teléfono identifica de forma única a un cliente.

**RF-CL-02 — Direcciones múltiples**
*Fase 1 · Prioridad Media*
Un cliente puede tener varias direcciones guardadas, una marcada como principal.
*Criterio de aceptación*: las direcciones se asocian al cliente y son reutilizables en pedidos.

**RF-CL-03 — Identificación automática de cliente**
*Fase 3 · Prioridad Media*
Al recibir un pedido remoto, si el teléfono coincide con un cliente registrado, el sistema lo sugiere con su última dirección y pedidos frecuentes.
*Criterio de aceptación*: un cliente recurrente es identificado por su teléfono sin recapturar datos.

**RF-CL-04 — Historial de pedidos por cliente**
*Fase 3 · Prioridad Baja*
El sistema mantiene el historial de pedidos de cada cliente.
*Criterio de aceptación*: es posible consultar los pedidos previos de un cliente.

### 3.4 Módulo IN — Inventario

**RF-IN-01 — Inventario de insumos por sucursal**
*Fase 2 · Prioridad Alta*
Cada sucursal mantiene su propio inventario de insumos con cantidad en su unidad correspondiente.
*Criterio de aceptación*: cada combinación sucursal-insumo tiene un único registro de inventario.

**RF-IN-02 — Descuento automático por venta**
*Fase 2 · Prioridad Alta*
Al confirmar un pedido, el sistema descuenta los insumos según la receta de cada producto, en una transacción atómica.
*Criterio de aceptación*: si algún insumo es insuficiente, la operación falla y se notifica; el inventario nunca queda en estado parcial.

**RF-IN-03 — Descuento de carne cruda por paquete**
*Fase 2 · Prioridad Alta*
Cada paquete de carne tiene asociada una cantidad fija de carne cruda (no calculada). Al vender, se descuenta esa cantidad del insumo de carne cruda del corte correspondiente.
*Criterio de aceptación*: el descuento usa el valor fijo definido en la receta del paquete; para mezclas de cortes, el descuento se reparte según la proporción de cada corte.

**RF-IN-04 — Recetas de producto**
*Fase 2 · Prioridad Alta*
Cada producto tiene una receta que define qué insumos y en qué cantidad consume.
*Criterio de aceptación*: un producto sin receta no descuenta inventario; los ingredientes variables se resuelven según la variante elegida.

**RF-IN-05 — Inventario de pollos**
*Fase 2 · Prioridad Alta*
El sistema maneja insumos de pollo en sus estados: crudo, asado, paquete de piezas crudo, paquete de piezas asado.
*Criterio de aceptación*: cada estado es un insumo independiente con su propio inventario por sucursal.

**RF-IN-06 — Transformación de pollos**
*Fase 2 · Prioridad Alta*
El encargado registra la transformación de pollo crudo a asado (y de paquete de piezas crudo a asado), solo en Sucursal B.
*Criterio de aceptación*: la transformación descuenta del insumo origen e incrementa el destino; queda registrada con número de tanda.

**RF-IN-07 — Insumos diarios y persistentes**
*Fase 2 · Prioridad Alta*
El sistema distingue insumos diarios (su inventario se reinicia cada día, ej. tortillas) de insumos persistentes (su inventario continúa entre días, ej. refrescos, papas).
*Criterio de aceptación*: los insumos diarios reinician su inventario en cada apertura; el sobrante de un insumo diario al cierre se considera merma.

**RF-IN-08 — Registro de carne sobrante por bolsa**
*Fase 2 · Prioridad Alta*
Al cierre, el encargado registra la carne cruda sobrante como un desglose por bolsa (ej. Sirloin: una bolsa de 3 kg, otra de 0.5 kg). El sistema no rastrea bolsas individuales con ciclo de vida; el desglose es una línea de detalle del cierre.
*Criterio de aceptación*: el desglose queda asociado al cierre del día; la apertura del día siguiente lo muestra como punto de partida con su fecha de origen.

**RF-IN-09 — Alertas de stock bajo**
*Fase 2 · Prioridad Media*
Cuando un insumo baja de su umbral configurable, el sistema genera una alerta de reabasto.
*Criterio de aceptación*: la alerta se genera automáticamente al cruzar el umbral.

**RF-IN-10 — Registro de entrada de inventario**
*Fase 2 · Prioridad Media*
El sistema permite registrar la entrada de insumos durante el día. Para insumos que se compran por bolsa (papas, boneless, tenders), la entrada se registra en bolsas y el sistema la convierte a la unidad de inventario.
*Criterio de aceptación*: la entrada incrementa el inventario del insumo en la sucursal correspondiente; las entradas por bolsa se convierten usando el rendimiento por bolsa del insumo.

**RF-IN-11 — Inventario de papas, boneless y tenders**
*Fase 2 · Prioridad Media*
Estos insumos se compran por bolsa y se consumen por gramos. El inventario contable se lleva en gramos; el descuento por venta usa el gramaje definido en la receta (orden completa 350 gr, complemento dentro de otro producto 175 gr). La visualización puede mostrar el equivalente en bolsas.
*Criterio de aceptación*: cada venta descuenta el gramaje correcto; el inventario puede consultarse tanto en gramos como en bolsas.

**RF-IN-12 — Visualización de insumos diarios en dashboard**
*Fase 2 · Prioridad Media*
El dashboard muestra el inventario de los insumos diarios en tiempo real (en particular las tortillas), para que el encargado anticipe la necesidad de reabasto.
*Criterio de aceptación*: el inventario de tortillas se ve actualizado en tiempo real sin recargar.

### 3.5 Módulo CS — Coordinación entre Sucursales

**RF-CS-01 — Inventario compartido visible**
*Fase 2 · Prioridad Alta*
Ambas sucursales pueden ver en tiempo real el inventario de pollos de la otra.
*Criterio de aceptación*: el inventario de la otra sucursal se actualiza sin recargar.

**RF-CS-02 — Registro de traslado**
*Fase 2 · Prioridad Alta*
Una sucursal registra el envío de un insumo a la otra, con cantidad y hora. El inventario de origen se descuenta al registrar.
*Criterio de aceptación*: el traslado queda en estado `PENDIENTE`; el origen refleja el descuento inmediatamente.

**RF-CS-03 — Confirmación de recepción**
*Fase 2 · Prioridad Alta*
La sucursal destino confirma la recepción del traslado. El inventario destino se incrementa al confirmar.
*Criterio de aceptación*: el traslado pasa a `CONFIRMADO`; el destino refleja el incremento solo tras la confirmación.

**RF-CS-04 — Cancelación de traslado**
*Fase 2 · Prioridad Media*
Un traslado pendiente puede cancelarse, revirtiendo el descuento del origen.
*Criterio de aceptación*: al cancelar, el inventario de origen recupera la cantidad.

**RF-CS-05 — Notificación de traslado**
*Fase 2 · Prioridad Alta*
La sucursal destino recibe una notificación visual cuando hay un traslado pendiente de confirmar.
*Criterio de aceptación*: la notificación aparece sin necesidad de comunicación telefónica.

**RF-CS-06 — Historial de traslados**
*Fase 2 · Prioridad Media*
El sistema mantiene el registro de todos los traslados del día para auditoría.
*Criterio de aceptación*: es posible consultar los traslados realizados con sus cantidades y horas.

### 3.6 Módulo AD — Administración y Registro Diario

**RF-AD-01 — Apertura del día**
*Fase 2 · Prioridad Alta*
El encargado registra al inicio: fondo de caja inicial y el estado inicial de los insumos diarios (tortillas, pollos, carne). El sistema muestra automáticamente la carne sobrante del cierre anterior como punto de partida.
*Criterio de aceptación*: solo existe una apertura por sucursal por fecha; la carne sobrante del cierre previo aparece precargada con su fecha de origen; el encargado puede sumar las entradas nuevas.

**RF-AD-09 — Registro de comidas de empleados**
*Fase 2 · Prioridad Media*
Antes del cierre, el encargado registra las comidas consumidas por el personal (cada empleado consume una comida diaria: un paquete de pollo, de carne, una torta, etc.). Cada comida descuenta inventario según la receta del producto, pero no genera ingreso ni afecta la caja.
*Criterio de aceptación*: las comidas registradas descuentan los insumos correspondientes; aparecen en el reporte de cierre como una sección separada de las ventas; no se contabilizan como ingreso.

**RF-AD-10 — Cálculo de consumo de tortillas**
*Fase 2 · Prioridad Media*
Al cierre, el sistema calcula y muestra automáticamente las tortillas consumidas durante el día, derivadas de las entradas registradas frente a las ventas y comidas de empleados.
*Criterio de aceptación*: el consumo de tortillas se presenta en el cierre sin captura manual; las tortillas son un insumo diario y su sobrante se considera merma.

**RF-AD-02 — Cierre del día**
*Fase 1 · Prioridad Alta*
El encargado registra al cierre: conteo físico de caja, mermas, gastos del día.
*Criterio de aceptación*: solo existe un cierre por sucursal por fecha.

**RF-AD-03 — Corte de caja con desglose por método de pago**
*Fase 1 · Prioridad Alta*
El sistema calcula las ventas totales del día desglosadas por efectivo, tarjeta y transferencia.
*Criterio de aceptación*: el desglose suma exactamente el total de ventas del día.

**RF-AD-04 — Conciliación automática**
*Fase 1 · Prioridad Alta*
El sistema calcula la diferencia entre el conteo físico de efectivo y lo esperado, considerando fondo inicial, ventas en efectivo y reembolsos en efectivo.
*Criterio de aceptación*: la diferencia se calcula automáticamente y se resalta si no es cero.

**RF-AD-05 — Registro de gastos**
*Fase 1 · Prioridad Media*
El encargado registra los gastos del día con concepto, monto y foto opcional del ticket.
*Criterio de aceptación*: los gastos quedan asociados al cierre del día.

**RF-AD-06 — Comparativa de inventario al cierre**
*Fase 2 · Prioridad Media*
El sistema compara lo registrado físicamente (bolsas, pollos) contra lo calculado por ventas, mostrando diferencias.
*Criterio de aceptación*: las discrepancias significativas se resaltan para revisión.

**RF-AD-07 — Reporte de cierre al dueño**
*Fase 1 · Prioridad Media*
Al cerrar el día, se genera un reporte de cierre que se envía al dueño.
*Criterio de aceptación*: el dueño recibe el reporte sin intervención manual.

**RF-AD-08 — Módulo de proveedores y compras**
*Fase 3 · Prioridad Media*
El sistema mantiene un catálogo de proveedores y registra compras con producto, cantidad, precio y fecha.
*Criterio de aceptación*: es posible consultar el histórico de precios y gastos por proveedor.

### 3.7 Módulo RM — Pedidos Remotos

**RF-RM-01 — Bot de WhatsApp**
*Fase 4 · Prioridad Alta*
Un bot automatizado en un número central de WhatsApp permite al cliente armar su pedido por flujo guiado, eligiendo productos, sucursal y hora de recolección.
*Criterio de aceptación*: el pedido armado por el bot llega al sistema estructurado y validado.

**RF-RM-02 — Asignación de pedido a sucursal**
*Fase 4 · Prioridad Alta*
El pedido capturado por el bot se asigna a la sucursal elegida por el cliente y aparece en su vista de pedidos.
*Criterio de aceptación*: el pedido remoto aparece en la sucursal correcta con origen `WHATSAPP`.

**RF-RM-03 — Captura de pedido telefónico**
*Fase 3 · Prioridad Alta*
El personal de sucursal captura en la terminal los pedidos recibidos por llamada telefónica al número de la sucursal.
*Criterio de aceptación*: el pedido telefónico entra al flujo normal con origen `TELEFONO`.

**RF-RM-04 — Menú digital interactivo**
*Fase 4 · Prioridad Media*
El bot ofrece un menú digital navegable (link) donde el cliente arma su pedido sin instalar una app.
*Criterio de aceptación*: el menú refleja el catálogo vigente y permite seleccionar variantes y extras.

**RF-RM-05 — Integración con plataformas de delivery**
*Fase 4 · Prioridad Baja*
El sistema queda preparado para recibir pedidos de plataformas de delivery (Rappi, UberEats, Didi Food) en el flujo unificado, marcados con su origen.
*Criterio de aceptación*: los pedidos de delivery aparecen en las vistas junto a los demás, con origen `DELIVERY`.

### 3.8 Módulo GD — Gestión Remota del Dueño

**RF-GD-01 — Dashboard móvil en vivo**
*Fase 3 · Prioridad Alta*
El dueño accede desde su celular a un dashboard con ventas del día por sucursal, productos más vendidos, inventario actual, movimientos de dinero y pedidos activos.
*Criterio de aceptación*: el dashboard se actualiza en tiempo real conforme ocurren las ventas.

**RF-GD-02 — Comparativa contra periodos previos**
*Fase 3 · Prioridad Media*
El dashboard muestra las ventas del día comparadas contra el mismo día de la semana anterior.
*Criterio de aceptación*: la comparativa es visible junto a las ventas del día.

**RF-GD-03 — Reportes automáticos por WhatsApp**
*Fase 4 · Prioridad Media*
El dueño recibe por WhatsApp un resumen diario al cierre y un resumen semanal con tendencias.
*Criterio de aceptación*: los reportes llegan automáticamente sin solicitud manual.

**RF-GD-04 — Reportes configurables**
*Fase 4 · Prioridad Baja*
El dueño puede configurar qué información incluyen sus reportes.
*Criterio de aceptación*: los cambios de configuración se reflejan en el siguiente reporte.

**RF-GD-05 — Gestión de catálogo y precios**
*Fase 3 · Prioridad Media*
El dueño puede gestionar el catálogo de productos: altas, bajas, edición de precios, orden de aparición y disponibilidad. Los precios son iguales en ambas sucursales.
*Criterio de aceptación*: los cambios al catálogo se reflejan en las terminales POS; los pedidos históricos conservan el precio al que se vendieron.

### 3.9 Módulo SE — Seguridad y Acceso

**RF-SE-01 — Autenticación de terminal por token**
*Fase 1 · Prioridad Alta*
Cada terminal POS se autentica mediante un token de dispositivo que la asocia a una sucursal.
*Criterio de aceptación*: las operaciones de una terminal quedan asociadas a su sucursal; un token inválido no permite operar.

**RF-SE-02 — Autenticación del dueño**
*Fase 3 · Prioridad Alta*
El dueño accede con email y contraseña mediante sesión segura con tokens.
*Criterio de aceptación*: credenciales inválidas no otorgan acceso; la sesión expira y se renueva de forma segura.

**RF-SE-03 — Segregación de datos por sucursal**
*Fase 1 · Prioridad Alta*
Una terminal solo puede consultar y modificar datos de su propia sucursal.
*Criterio de aceptación*: una terminal no puede acceder a datos de otra sucursal salvo la información de inventario compartido explícitamente permitida.

---

## 4. Requerimientos No Funcionales

### 4.1 Rendimiento

**RNF-01 — Tiempo de respuesta del POS**
La captura y el cobro de un pedido deben completarse con respuestas perceptiblemente inmediatas en condiciones normales de red.

**RNF-02 — Capacidad en horas pico**
El sistema debe operar sin degradación durante las horas de mayor demanda (aproximadamente 1:30 a 3:30 pm).

**RNF-03 — Impresión inmediata**
La impresión de tickets y comandas debe iniciarse inmediatamente tras el cobro.

### 4.2 Disponibilidad y tolerancia a fallos

**RNF-04 — Operación offline de funciones locales**
La terminal POS debe operar de forma completamente autónoma sin internet para todas las funciones locales de la sucursal: registro de ventas, cobro, impresión, cancelaciones, reembolsos, descuento de inventario, entradas de inventario, transformaciones de pollo y cierre de caja.

**RNF-05 — Degradación de funciones entre-sucursales**
Las funciones que dependen de datos compartidos entre sucursales (inventario de pollos de la otra sucursal, traslados, dashboard, bot de WhatsApp) requieren conexión. Ante una caída, deben degradarse mostrando un aviso claro al usuario, sin bloquear las funciones locales.

**RNF-06 — Sincronización sin pérdida ni duplicación**
Al recuperar la conexión, las operaciones realizadas offline se sincronizan con la nube sin perderse ni duplicarse. Los identificadores UUID generados en el cliente garantizan la idempotencia de la sincronización.

**RNF-07 — Redundancia de conexión**
Cada sucursal cuenta con failover automático a 4G/5G como respaldo del internet principal.

**RNF-08 — Integridad transaccional**
Toda operación que afecte inventario y pedido simultáneamente debe ser atómica: se completa por entero o no se aplica.

**RNF-09 — Sin pérdida de datos**
Ningún pedido cobrado puede perderse, incluso ante fallos de red o reinicio de la terminal. Las operaciones offline se persisten en la base de datos local de la terminal.

### 4.3 Usabilidad

**RNF-10 — Interfaz táctil para uso rápido**
La interfaz del POS está diseñada para uso táctil con tipografía grande y mínimo número de toques en las acciones frecuentes.

**RNF-11 — Curva de aprendizaje baja**
El personal actual debe poder operar el sistema con capacitación mínima, dada su familiaridad con el negocio.

**RNF-12 — Idioma**
Toda la interfaz y los documentos para el usuario están en español.

### 4.4 Seguridad

**RNF-13 — Protección de credenciales**
Las contraseñas se almacenan con hash; nunca en texto plano.

**RNF-14 — Comunicación cifrada**
Toda comunicación entre clientes y backend usa conexiones cifradas (HTTPS/WSS).

**RNF-15 — Autorización por contexto**
Cada petición se valida contra el contexto del solicitante (sucursal del dispositivo o rol del usuario).

### 4.5 Mantenibilidad y escalabilidad

**RNF-16 — Código tipado**
Todo el sistema se desarrolla en TypeScript estricto.

**RNF-17 — Migraciones versionadas**
Los cambios al modelo de datos se gestionan mediante migraciones versionadas.

**RNF-18 — Escalabilidad a más sucursales**
Agregar una nueva sucursal no debe requerir cambios estructurales en el modelo de datos ni en la lógica.

**RNF-19 — Separación de configuración**
Las credenciales y parámetros de entorno se gestionan fuera del código fuente.

### 4.6 Datos y consistencia

**RNF-20 — Precisión monetaria**
Los valores monetarios, pesos y cantidades usan tipos decimales; nunca punto flotante.

**RNF-21 — Manejo de zona horaria**
Las fechas se almacenan en UTC y se presentan en hora local (America/Mazatlan).

**RNF-22 — Conservación de histórico**
Los pedidos conservan el precio al que se vendieron, independientemente de cambios de precio posteriores.

---

## 5. Reglas de negocio transversales

| ID | Regla |
|---|---|
| RN-01 | En un paquete de carne, todos los cortes seleccionados deben pertenecer al mismo grupo de precio. |
| RN-02 | La suma de proporciones de los cortes de un mismo item de pedido debe ser exactamente 1.000. |
| RN-03 | El folio de pedido se reinicia diariamente y es consecutivo por sucursal. |
| RN-04 | Cancelar un pedido cobrado genera un reembolso por el monto pagado, que afecta el corte de caja. |
| RN-05 | Cancelar un pedido revierte cualquier descuento de inventario aplicado. |
| RN-06 | Las transformaciones de pollo solo ocurren en Sucursal B. |
| RN-07 | El inventario de origen de un traslado se descuenta al registrarlo; el destino se incrementa al confirmarlo. |
| RN-08 | Solo existe una apertura y un cierre por sucursal por fecha. |
| RN-09 | El descuento de carne cruda usa la cantidad fija definida en la receta del paquete. |
| RN-10 | Los precios son iguales en ambas sucursales. |
| RN-11 | El descuento de inventario por venta es una transacción atómica: si un insumo es insuficiente, falla por completo. |
| RN-12 | Las comidas de empleados descuentan inventario por receta pero no generan ingreso ni afectan la caja. |
| RN-13 | Los insumos diarios reinician su inventario cada día; el sobrante (excepto la carne, que se transfiere por desglose de bolsas) se considera merma. |

---

## 6. Trazabilidad de fases

| Fase | Módulos principales | Objetivo de la iteración |
|---|---|---|
| **Fase 1** | PV, PE (básico), CL (básico), AD (cierre/caja), SE (terminal) | POS funcional que reemplaza al sistema actual |
| **Fase 2** | IN, CS, AD (apertura/inventario) | Inventario y coordinación entre sucursales |
| **Fase 3** | PE (extendido), RM (telefónico), GD (dashboard), AD (proveedores), SE (dueño) | Pedidos remotos y gestión del dueño |
| **Fase 4** | RM (bot, delivery), GD (reportes) | Automatización y canales digitales |

---

*Documento generado a partir de la sesión de diseño técnico de Las Brasas POS. Complementa a CONTEXT.md. Las fases representan iteraciones secuenciales de trabajo, no recortes de alcance: el sistema completo abarca las cuatro.*
