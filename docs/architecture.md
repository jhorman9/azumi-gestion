# Arquitectura y plan de implementación

## Alcance

Aplicación interna para una sola empresa/restaurante. El POS existente sigue
siendo responsable de las ventas y facturación; el gerente registra sus
resúmenes. El menú público seguirá en otra web. No se incluyen caja, pedidos,
inventario por ingredientes ni sincronización automática con el POS.

## Stack y estructura

- Next.js App Router y TypeScript `strict`.
- Interfaz en español, responsive y accesible con CSS estándar; no Tailwind ni
  shadcn/ui, según la preferencia del proyecto.
- MySQL administrado por Hostinger/phpMyAdmin y `mysql2/promise`; repositorios
  SQL explícitos con consultas parametrizadas, sin ORM.
- Validación de entrada en servidor; autorización en cada operación del
  servidor, no solo en la interfaz.
- Capas previstas: UI → acciones/controladores → servicios → repositorios SQL
  → MySQL.
- Migraciones secuenciales en `database/migrations/`; cambios financieros con
  auditoría y anulaciones/reversiones en vez de borrado definitivo.

## Roles y navegación prevista

| Rol | Acceso |
|---|---|
| Administrador | Todos los módulos, cierres, finanzas, menú, promociones y usuarios. |
| Gerente | Operación y finanzas autorizadas; puede administrar menú. |
| Editor de menú | Categorías, productos y promociones; sin datos financieros. |

Navegación privada prevista: Inicio, Cierres diarios, Gastos, Proveedores y
cuentas por pagar, Finanzas, Menú digital y Promociones. Usuarios y permisos
quedan en Administración. Personal se reserva para una fase posterior. Cada
ruta y mutación deberá validar la sesión y el permiso en el servidor.

## Decisiones contables iniciales

- Un único cierre confirmado por fecha de operación; la fecha se almacena como
  `DATE` y los cambios de confirmación/corrección quedan auditados.
- El cierre conserva ventas reportadas por el POS y el desglose de medios de
  pago como información de conciliación; no se interpreta como efectivo ya
  disponible.
- Una factura de proveedor representa una obligación. Sus pagos parciales
  reducen el saldo pendiente; la factura no se vuelve a registrar como gasto.
- Reportes separarán ventas reportadas, importes cobrados, gastos incurridos,
  importes pagados y obligaciones pendientes. No se etiquetará una resta
  incompleta como “ganancia neta”.
- Importes MySQL `DECIMAL(12,2)` se mantienen como decimales/cadenas y no se
  calculan con `float` de JavaScript.
- Zona horaria de negocio: `America/Panama`; fechas de operación no se
  convierten como timestamps. Los timestamps técnicos se guardan en UTC cuando
  aplique.
- Las promociones no cambian el precio base, no se acumulan y no modifican el
  POS; el precio efectivo se calcula y se prueba en el servidor.

## Plan por fases y dependencias

1. **Fase 0 — Preparación:** validar el runtime real de Hostinger, acordar
   contratos de datos y modelo SQL, documentar navegación/roles, configurar
   entorno, conexión MySQL y controles de calidad. Bloquea el diseño final de
   migraciones la verificación de versiones y límites del plan.
2. **Fase 1 — MVP gerencial:** autenticación privada y administración mínima
   de usuarios → cierres diarios y auditoría → gastos, proveedores y facturas
   con pagos → dashboard y reportes. Los reportes dependen de las reglas de
   contabilización y tablas aprobadas primero.
3. **Fase 2 — Menú y promociones:** CRUD de categorías/productos → promociones
   y prioridad no acumulable → vista previa, auditoría y contrato JSON para
   futura integración con la web externa. No se implementa esa integración
   hasta conocer su consumidor.
4. **Fase 3 — Mejoras administrativas:** personal básico, exportaciones,
   importador CSV solo tras recibir un ejemplo real del POS, pruebas de
   respaldo/restauración y validación de despliegue.

## Bloqueos externos por resolver

Antes de cerrar la compatibilidad de despliegue se necesita el plan exacto de
Hostinger y confirmar que ejecuta Next.js en servidor, además de sus versiones
de Node.js y MySQL, límites de memoria/procesos/conexiones y método de
despliegue. No se presume acceso SSH, cron ni conexiones externas a MySQL.

La integración futura del menú requiere conocer cómo consume datos la web
existente. La importación CSV requiere un archivo real de ejemplo. Ninguna de
las dos se inventará.

## Seguridad y operación

- Secretos solo en variables de entorno del servidor; `.env.example` contiene
  marcadores, nunca credenciales reales.
- Cookies de sesión `HttpOnly`, `SameSite` y `Secure` en producción; hash de
  contraseña seguro, sin registro público y límites de intentos de login.
- Consultas SQL parametrizadas, validación y autorización en servidor, auditoría
  de acciones sensibles y límites para archivos si se habilitan adjuntos.
- Pool MySQL pequeño y reutilizado; transacciones para operaciones financieras.
- Migraciones compatibles con la versión concreta de MySQL y ejecutables en
  orden desde phpMyAdmin; probar copias y restauración antes del despliegue.
