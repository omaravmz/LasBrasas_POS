# CLAUDE.md — Las Brasas POS

Reglas operativas para trabajar en este proyecto. Léelas antes de cualquier tarea.

## Documentos del proyecto

Antes de implementar, consulta el documento relevante. Son la fuente de verdad:

- **CONTEXT.md** — qué es el sistema: negocio, arquitectura, stack, modelo de datos (schema Prisma), reglas de negocio, flujos. Es la referencia principal.
- **SRS.md** — requerimientos funcionales y no funcionales numerados, con criterios de aceptación.
- **ER.md** — modelo entidad-relación descrito en texto.
- **PLAN.md** — roadmap: fases, hitos, dependencias, criterios de "hecho".

Ante cualquier discrepancia entre documentos, el schema de Prisma en CONTEXT.md gana.

## Reglas no negociables

1. **No replanees ni rediseñes.** Las decisiones de arquitectura, stack y modelo ya están tomadas y documentadas. Si una tarea parece requerir una decisión de diseño nueva, detente y pregunta en lugar de decidir por tu cuenta.

2. **TypeScript estricto siempre.** Nada de `any` explícito. Si un tipo es complejo, modélalo bien.

3. **Trabaja por hitos.** Implementa el hito que se te pide del PLAN.md, no más. No adelantes trabajo de hitos futuros.

4. **Respeta el criterio de "hecho".** Un hito no está terminado hasta cumplir su criterio en el PLAN.md, incluyendo tests.

## Convenciones de código

- **Nomenclatura**: modelos en singular. `camelCase` para variables y funciones. `SCREAMING_SNAKE_CASE` para enums. Nombres en español para conceptos de dominio (Pedido, Sucursal, Insumo); inglés solo para términos técnicos universales.
- **IDs**: UUID v4, generados en el cliente (no autoincrementales del servidor). Esto es crítico para la sincronización offline.
- **Dinero, pesos y cantidades**: tipo `Decimal` de Prisma. Nunca `Float` ni `number` para valores monetarios.
- **Fechas**: se almacenan en UTC. Se presentan en hora local America/Mazatlan (UTC-7). La conversión ocurre en el cliente.
- **Errores**: el backend responde con `{ code, message, details }`. Sin stack traces en producción.
- **Variables de entorno**: credenciales y config fuera del código. Nunca commitear `.env`.

## Reglas de negocio que el código debe enforzar

Estas viven en el backend, no solo en el frontend. Referencia completa en CONTEXT.md sección 6:

- Mezcla de cortes: todos los cortes de un paquete deben ser del mismo grupo de precio; las proporciones suman 1.000.
- Folio: consecutivo diario por sucursal, asignado de forma atómica.
- Descuento de inventario por venta: transacción atómica (`prisma.$transaction()`). Si un insumo es insuficiente, falla por completo.
- Cancelar un pedido revierte su descuento de inventario; si estaba cobrado, registra reembolso.
- Transformaciones de pollo: solo en Sucursal B.
- Traslados: el origen se descuenta al registrar; el destino se incrementa al confirmar.
- Una sola apertura y un solo cierre por sucursal por fecha.
- Comidas de empleados descuentan inventario pero no afectan la caja.

## Arquitectura offline

Concepto crítico (CONTEXT.md sección 2.1.1): las funciones locales a una sucursal funcionan sin internet; las entre-sucursales requieren conexión.

- Toda operación local (venta, cobro, cancelación, inventario propio) debe persistir en IndexedDB y funcionar offline.
- La sincronización debe ser idempotente: reenviar una operación no la duplica (gracias a los UUID de cliente).
- No asumas conexión disponible en el flujo de venta.

## Prioridades de riesgo técnico

Invierte cuidado y tests extra en (CONTEXT.md sección 10): impresión, corte de caja y conciliación, integridad transaccional del descuento de inventario. No es prioridad un sistema de roles granular (ya resuelto por tokens de dispositivo).

## Patrones a seguir

- **Impresión**: detrás de una interfaz abstracta (`ImpresoraService`). Implementación real (Kotlin/SDK) e implementación de desarrollo (genera PDF/imagen) intercambiables. La lógica que genera el contenido del ticket es independiente del dispositivo y debe tener tests.
- **Lógica de negocio**: en servicios, no en controladores ni en componentes de UI. Los controladores validan entrada y delegan.
- **Acceso a datos**: vía Prisma en el backend. El frontend POS accede a IndexedDB mediante su capa local, nunca directo a la base de la nube para operaciones de escritura críticas.

## Antes de dar una tarea por terminada

- ¿Cumple el criterio de "hecho" del hito en PLAN.md?
- ¿Tiene tests para la lógica de negocio y los casos de error?
- ¿Compila en TypeScript estricto sin warnings?
- ¿Respeta las reglas de negocio aplicables?
- Si tocó algo offline, ¿funciona sin conexión y sincroniza sin duplicar?

## Si algo no está claro

Pregunta antes de asumir. Es preferible una pregunta a una decisión de diseño tomada sin contexto. Especialmente: no inventes valores de negocio (precios, gramajes, rendimientos de bolsa) — si un dato falta, pídelo.

## Token Efficient Rules

1. Think before acting. Read existing files before writing code.
2. Be concise in output but thorough in reasoning.
3. Prefer editing over rewriting whole files.
4. Do not re-read files you have already read unless the file may have changed.
5. Test your code before declaring done.
6. No sycophantic openers or closing fluff.
7. Keep solutions simple and direct.
8. User instructions always override this file.