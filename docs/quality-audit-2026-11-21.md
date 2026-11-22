# Registro de revisión y pruebas — 2026-11-21

## Conclusión

El proyecto compila y supera lint y TypeScript. La conexión a MariaDB y las
migraciones están operativas, las rutas privadas rechazan visitas sin sesión y
las comprobaciones de consistencia sobre los datos existentes no encontraron
desajustes.

No se puede certificar que todo funcione al 100%: no hay una suite automatizada,
el navegador muestra un rechazo de credenciales y por eso no se probaron las
pantallas ni las operaciones CRUD con una sesión autenticada. Esta revisión no
modificó datos de negocio.

## Entorno comprobado

- Next.js 16.4.6, React 19.3.1 y Node.js 24.15.0 en el entorno local.
- MariaDB 11.8.9; las variables de conexión están configuradas y el secreto de
  sesión cumple el mínimo de longitud requerido.
- La compatibilidad de versión declarada con Node.js 22.x no se ejecutó en
  Node.js 22; esa versión debe probarse antes del despliegue.
- Están registradas las migraciones `001_initial_schema`,
  `002_cash_closing_pdf_format`, `003_closing_cash_total` y
  `004_provider_expenses_and_cash_deductions`.

## Pruebas ejecutadas

| Prueba | Resultado | Evidencia |
|---|---|---|
| `npm run lint` | Correcto | ESLint terminó sin errores. |
| `npm run typecheck` | Correcto | `tsc --noEmit` terminó sin errores. |
| `npm run build` | Correcto | Compiló todas las páginas y API routes. Se usó una carpeta de salida temporal para no interferir con el servidor de desarrollo y se eliminó al terminar. |
| `git diff --check` | Correcto | Sin errores de whitespace; Git mostró avisos de conversión de finales de línea en archivos ya modificados. |
| Conexión y esquema | Correcto | Conexión a MariaDB 11.8.9; 20 tablas detectadas y las cuatro migraciones aplicadas. |
| Reconciliación de cierres | Correcto | Cero cierres cuyo Reporte Z no coincida con efectivo neto + banco + Pedidos Ya. |
| Gastos descontados | Correcto | Cero gastos pagados marcados para descuento sin un cierre de la fecha indicada. |
| Cuentas por pagar | Correcto | Cero facturas con pagos acumulados por encima del monto de la factura. |
| Sesiones expiradas | Correcto | Cero sesiones expiradas en la tabla. |
| Consulta del historial de cierres | Correcto | La consulta corregida se ejecutó directamente en MariaDB y devolvió el cierre existente. |
| Login público | Correcto | `GET /login` devolvió HTTP 200. |
| Protección de páginas | Correcto | Las 10 rutas privadas comprobadas redirigieron con HTTP 307 al no haber sesión. |
| Protección de escritura | Correcto | Las 12 rutas de mutación comprobadas devolvieron HTTP 401 sin sesión. |
| Protección de origen | Correcto | Una solicitud de login con origen externo fue rechazada con HTTP 403. |

Las rutas privadas comprobadas fueron `/admin/users`, `/dashboard`,
`/dashboard/closings`, `/dashboard/closings/1`, `/dashboard/expenses`,
`/dashboard/suppliers`, `/dashboard/bills`, `/dashboard/reports`,
`/dashboard/audit` y `/dashboard/menu`.

Las rutas de escritura comprobadas fueron creación/edición/anulación de cierres
y gastos, creación/estado de proveedores, facturas y pagos, y administración de
usuarios/estado.

## Estado de los datos al revisar

La base contiene un usuario activo, un cierre, un gasto, un proveedor y seis
registros de auditoría. También hay 10 filas de pagos por canal y una propina
asociadas a los datos existentes; no hay facturas ni pagos de facturas. No se
imprimieron nombres, correos, montos ni secretos. Las categorías y plantillas de
gastos ya no existen.

Los conteos se usaron solo para revisar estado y no se cambiaron durante esta
auditoría.

## Inventario funcional y elementos pendientes

- **Autenticación y usuarios:** rutas y pantallas compilan; las rutas protegidas
  bloquean solicitudes anónimas. La pantalla compartida del navegador muestra
  “Credenciales incorrectas o acceso temporalmente limitado”. La base no
  reporta cuentas actualmente bloqueadas, pero no se pudo completar un login
  válido ni atribuir el rechazo a contraseña o cuenta.
- **Cierres:** creación/corrección y vista de historial están implementadas; la
  consulta ambigua reportada anteriormente ya está corregida y validada.
- **Gastos, proveedores, cuentas por pagar, informes y auditoría:** sus páginas y
  rutas se incluyen en la compilación. Los datos actuales permiten revisar
  gastos/proveedores/auditoría, pero no hay facturas para probar pagos parciales
  con datos reales.
- **Menú digital:** en la fecha de esta revisión, la página aún era un marcador
  “Próximamente”, sin operaciones API.
- **Vista previa de cierres:** `/closing-preview` es solo para desarrollo, no
  guarda datos y devuelve 404 en producción.
- **Componentes compartidos:** las búsquedas de referencias encontraron uso de
  los componentes de navegación, formularios, auditoría, métricas y gráfico; no
  se identificó un componente funcional claramente huérfano que convenga borrar
  sin riesgo.
- **Pruebas automatizadas:** `package.json` no define un script `test` ni hay un
  runner configurado. Las pruebas CRUD con sesión y regresiones automatizadas
  siguen pendientes.
- **Gestor de paquetes:** existen `package-lock.json` y `pnpm-lock.yaml`, y no
  está fijado `packageManager`; conviene escoger npm o pnpm antes de preparar
  una instalación de despliegue.

## Siguientes pasos recomendados

1. Iniciar sesión con una cuenta válida y recorrer pantallas privadas; ejecutar
   altas, correcciones, anulaciones y pagos usando una base de pruebas o
   transacciones con rollback, no los datos reales.
2. Verificar el login y el build bajo Node.js 22.x, que es el runtime previsto
   para Hostinger.
3. Elegir un solo gestor de paquetes y agregar pruebas automatizadas para los
   cálculos monetarios y el recálculo transaccional de gastos/cierres.

## Estado del repositorio

Al comenzar esta revisión ya había numerosos archivos modificados y nuevos de
trabajo previo. Se conservaron intactos; revisar `git status` antes de preparar
un commit para no mezclar o descartar esos cambios.

## Seguimiento — retiro del menú digital

Después de esta revisión se eliminó la página y el enlace de navegación del
menú digital, se retiró el permiso y se deshabilitó la creación/reactivación del
rol `menu_editor`. La migración `005_retire_menu_editor_accounts.sql` se aplicó
a la base de desarrollo y encontró cero cuentas que desactivar. La ruta del
menú ahora devuelve HTTP 404; build, lint y TypeScript pasan después del retiro.
Las tablas históricas del menú y promociones se conservan; no se borraron datos
ni tablas.
