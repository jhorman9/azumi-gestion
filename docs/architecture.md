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
- MySQL/MariaDB administrado por Hostinger/phpMyAdmin y `mysql2/promise`;
  repositorios SQL explícitos con consultas parametrizadas, sin ORM.
- Validación de entrada en servidor; autorización en cada operación del
  servidor, no solo en la interfaz.
- Capas previstas: UI → acciones/controladores → servicios → repositorios SQL
  → MySQL.
- Contraseñas con bcrypt; sesiones opacas aleatorias almacenadas como HMAC en
  MySQL y cookies `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
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
- Los cierres se guardan como borradores o se confirman; corregir un cierre
  confirmado exige un motivo y conserva el antes/después en la auditoría.
- El cierre conserva `reported_sales_total` como Total Ventas / Reporte Z y
  registra `pedidos_ya_total` por separado. Reporte Z se calcula como Efectivo
  + Total Banco + Pedidos Ya.
- La matriz de Tarjeta de crédito/Clave por Punto de Venta, BAC, Banesco, Yappy
  y ACH desglosa Reporte Z, no representa ventas adicionales. Total Banco es la
  suma de sus diez celdas y no vuelve a sumarse fuera del desglose.
- El efectivo se captura en el campo `cash_total` como monto contado/registrado;
  no se calcula restando banco ni salidas. Las salidas conservan descripción e
  importe en el cierre y no crean gastos. Las propinas se guardan por persona e
  importe; su total es calculado por separado y no se suma a ventas ni banco.
  “Realizado por” corresponde al usuario autenticado que creó el cierre.
- La migración del formato PDF conserva los cierres y sus datos genéricos
  históricos; no los convierte a la matriz nueva por no existir una equivalencia
  contable fiable.
- Los gastos registran fecha incurrida y, al pagarse, fecha efectiva y medio de
  pago. Las facturas de proveedores son obligaciones separadas; los pagos
  parciales se registran contra el saldo y no vuelven a sumarse como gasto.
- Una factura de proveedor representa una obligación; sus pagos parciales
  reducen el saldo pendiente y no se vuelven a registrar como gasto.
- Reportes separarán ventas reportadas, importes cobrados, gastos incurridos,
  importes pagados y obligaciones pendientes. No se etiquetará una resta
  incompleta como “ganancia neta”.
- Importes MySQL `DECIMAL(12,2)` se mantienen como decimales/cadenas y no se
  calculan con `float` de JavaScript.
- Zona horaria de negocio: `America/Panama`; fechas de operación no se
  convierten como timestamps. La aplicación escribe timestamps técnicos en
  UTC; horarios de promociones se capturan en hora de Panamá y se convierten a
  UTC al persistirlos.
- Las promociones no cambian el precio base, no se acumulan y no modifican el
  POS; el precio efectivo se calcula y se prueba en el servidor. Una promoción
  debe apuntar a productos o a categorías, no a ambos; la validación se hará en
  el servicio de dominio.

## Plan por fases y dependencias

1. **Fase 0 — Preparación:** validar el runtime real de Hostinger, acordar
   contratos de datos y modelo SQL, documentar navegación/roles, configurar
   entorno, conexión MySQL y controles de calidad. La conexión actual reporta
   MariaDB 11.8.9; falta confirmar que sea el servidor del plan de despliegue y
   verificar sus límites.
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

El usuario confirmó que el plan de Hostinger ofrece Node.js 22.x. Next.js
16.4.6 declara Node.js `>=20.9.0`, por lo que 22.x satisface el requisito del
framework. Antes de cerrar la compatibilidad de despliegue, confirmar que el
plan admita Next.js SSR, las versiones de MySQL/MariaDB, límites de
memoria/procesos/conexiones y método de despliegue. No se presume acceso SSH,
cron ni conexiones externas a MySQL.

La integración futura del menú requiere conocer cómo consume datos la web
existente. La importación CSV requiere un archivo real de ejemplo. Ninguna de
las dos se inventará.

## Seguridad y operación

- Secretos solo en variables de entorno del servidor; `.env.example` contiene
  marcadores, nunca credenciales reales.
- Cookies de sesión `HttpOnly`, `SameSite` y `Secure` en producción; hash de
  contraseña seguro, sin registro público y límites de intentos de login.
- La Fase 1 limita a cinco intentos fallidos por cuenta cada 15 minutos. El
  primer administrador se aprovisiona por CLI; no hay formulario público de
  registro.
- Consultas SQL parametrizadas, validación y autorización en servidor, auditoría
  de acciones sensibles y límites para archivos si se habilitan adjuntos.
- Pool MySQL pequeño y reutilizado; transacciones para operaciones financieras.
- Migraciones compatibles con la versión concreta de MySQL y ejecutables en
  orden desde phpMyAdmin; probar copias y restauración antes del despliegue.
