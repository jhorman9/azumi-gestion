# Manual completo del Mini CRM Azumi

Esta guía describe el sistema tal como está implementado: sus módulos,
procedimientos de uso, reglas financieras y tareas técnicas de instalación y
operación.

## 1. Propósito y alcance

El Mini CRM es una aplicación privada para la administración financiera diaria
del restaurante. Centraliza cierres de caja, gastos, proveedores, cuentas por
pagar, propinas, informes y auditoría.

No sustituye el POS, no procesa pedidos y no sincroniza automáticamente datos
con el POS ni con la web pública del menú. El sistema administra una sola
empresa. Los valores financieros se registran con dos decimales.

## 2. Acceso, roles y seguridad

### Iniciar y cerrar sesión

1. Abre `/login`.
2. Ingresa el correo y la contraseña de una cuenta activa.
3. Usa **Salir** en la navegación para cerrar la sesión.

No hay registro público. El primer administrador se crea desde la terminal; las
cuentas siguientes se gestionan desde **Usuarios**.

### Roles

| Rol | Acceso |
| --- | --- |
| Administrador (`admin`) | Todos los módulos, incluida la gestión de usuarios. |
| Gerente (`manager`) | Dashboard, cierres y módulos financieros; no puede gestionar usuarios. |
| Editor de menú (`menu_editor`) | Rol retirado. Las cuentas antiguas de este rol se desactivan y no pueden iniciar sesión. |

Los permisos se verifican en el servidor, no solo ocultando controles en la
interfaz. Las sesiones duran 12 horas. Los intentos fallidos de inicio de sesión
pueden bloquear temporalmente la cuenta; si el acceso se limita, espera y
comprueba el correo, la contraseña y que el usuario siga activo.

## 3. Módulos y procedimientos de uso

### Dashboard — `/dashboard`

Presenta los indicadores del período seleccionado:

- **Reporte Z neto − gastos sin descuento:** Reporte Z neto de los cierres
  confirmados o corregidos, menos los gastos pagados no asignados a un cierre
  por fecha del gasto. Puede ser negativo; ese valor registra una pérdida.
  Los gastos asignados a cierres ya están descontados del Reporte Z y no se
  restan de nuevo.
- **Gastos incurridos:** gastos pagados por fecha del gasto; se desglosan entre
  los que tienen descuento de cierre asignado y los que no.
- **Gastos pagados:** gastos pagados según su fecha efectiva de pago.
- **Facturas emitidas:** obligaciones abiertas con fecha de emisión dentro del
  período.
- **Pagos a proveedores:** pagos de facturas realizados dentro del período.
- **Saldo por pagar** y **saldo vencido:** saldos pendientes actuales, no un
  historial de saldos al cierre del período seleccionado.

El período puede ser un mes calendario o un año calendario. De forma
predeterminada se muestra el mes actual en la zona horaria de Panamá. Los meses
incluyen todos sus días —incluido el 29 de febrero en años bisiestos— y el año
va del 1 de enero al 31 de diciembre.

El resumen muestra el Reporte Z neto de cierres menos los gastos sin descuento
de cierre. El panel de tratamiento muestra los importes usados en ese cálculo,
separa los gastos por fecha del gasto y también muestra lo descontado en
cierres confirmados/corregidos por fecha del cierre. El gráfico conserva el
Reporte Z real de los cierres y compara ambas categorías de gastos; en la vista
mensual muestra la evolución diaria y en la anual la evolución por mes. Al
pasar el puntero sobre los puntos se muestra el valor exacto. El resumen no
representa utilidad neta. Un gráfico de anillo separa el saldo pendiente actual
entre facturas al día y vencidas; no es un saldo histórico del período. El
sidebar puede ocultarse o mostrarse y recuerda la preferencia en el navegador.

### Cierres diarios — `/dashboard/closings`

Registra la información de cierre del POS para una fecha de operación. Solo
puede existir un cierre por fecha; un borrador también reserva esa fecha.

1. Selecciona la fecha de operación.
2. Ingresa el efectivo contado antes de las salidas y el total de Pedidos Ya.
3. Registra los montos de tarjeta de crédito y Clave según su canal: Punto de
   Venta, BAC, Banesco, Yappy o ACH. Los importes no utilizados se dejan en
   cero.
4. Si hubo salidas directas de caja, registra su descripción e importe. Hay
   hasta seis líneas; cada salida debe tener descripción e importe.
5. Ingresa el total diario de propinas y cualquier nota.
6. Revisa los totales calculados y guarda el cierre. Los borradores pueden
   seguir editándose; confirma el cierre cuando la revisión esté completa.

El detalle del cierre muestra su estado, las acciones de auditoría y los gastos
que se le hayan asignado. Una corrección de un cierre confirmado requiere
indicar el motivo y queda registrada en auditoría.

#### Cálculo del cierre

- **Total bancario:** suma de los diez importes posibles (dos tipos de pago por
  cinco canales).
- **Efectivo neto:** efectivo contado menos salidas de caja y menos gastos
  pagados asignados a esa fecha de cierre.
- **Reporte Z bruto:** efectivo contado + total bancario + Pedidos Ya.
- **Reporte Z neto:** efectivo neto + total bancario + Pedidos Ya.
- **Propinas:** se registran aparte y no se suman al Reporte Z.

Los gastos asignados y las salidas no pueden exceder el efectivo contado.
Registra como gasto solo una compra real; una salida de caja que no deba
figurar como gasto se registra como salida, no como gasto.

El historial presenta los cierres por fecha y pagina los resultados para evitar
listas largas.

### Gastos — `/dashboard/expenses`

Registra gastos pagados a proveedores. Cada gasto incluye proveedor, fecha del
gasto, importe, método de pago y si debe descontarse del cierre de caja de una
fecha determinada.

Los métodos disponibles son efectivo, tarjeta y Yappy. En **Tratamiento en el
cierre**, selecciona explícitamente si el gasto se descuenta:

- **Sí, descontar:** el gasto pagado se asigna a la fecha de cierre indicada y
  reduce su efectivo y Reporte Z neto. Cuando el cierre está confirmado o
  corregido, el descuento ya forma parte del Reporte Z neto.
- **No descontar:** el gasto se conserva en los informes, pero no cambia el
  efectivo ni el Reporte Z de ningún cierre.

La lista identifica si el gasto no descuenta, está asignado a un cierre
pendiente o ya se descontó de un cierre confirmado. El formulario o el detalle
permite editar información y anular un registro; la anulación queda auditada y
evita borrar el historial.

La estadística mensual permite consultar un mes específico y muestra cuánto se
resta del Reporte Z del período por gastos sin asignación a cierres, junto con
el monto de gastos asignados y el total pagado. Los importes se agrupan por la
fecha del gasto; la deducción de un gasto asignado usa la fecha del cierre.

La lista está paginada. Antes de anular o cambiar un gasto asignado, revisa el
cierre asociado y el nuevo efectivo neto.

### Proveedores — `/dashboard/suppliers`

Mantiene el directorio de proveedores con nombre legal, contacto, teléfono,
correo y notas. Se pueden activar o desactivar proveedores. Desactivar un
proveedor evita seleccionarlo para nuevos registros, sin eliminar su historial.

### Cuentas por pagar — `/dashboard/bills`

1. Selecciona un proveedor activo.
2. Ingresa el número o referencia de factura si existe, la fecha de emisión, la
   fecha de vencimiento (si aplica) y el importe total.
3. Añade notas cuando sean útiles para identificar la obligación.
4. Abre la factura y registra cada pago parcial con fecha, importe, método y
   referencia opcional.

El saldo se calcula como importe de la factura menos los pagos registrados. No
se debe registrar el pago de una factura como un gasto adicional: el sistema
informa por separado las obligaciones emitidas y los pagos a proveedores para
evitar contar dos veces el mismo desembolso. Una factura abierta sin pagos se
puede anular desde su ficha; las facturas con pagos registrados no se pueden
anular para conservar la trazabilidad de esos desembolsos. Las listas están
paginadas.

### Propinas — `/dashboard/tips`

Consulta las propinas registradas desde los cierres por día, semana o mes. Las
semanas se agrupan de lunes a domingo. La vista paginada muestra la fecha, el
total del cierre y los datos disponibles del cierre; las propinas son un total
diario separado, no una partida que aumente las ventas del Reporte Z.

### Informes — `/dashboard/reports`

Selecciona el rango de fechas para consultar los cierres y movimientos
financieros del período. Los informes mantienen separados:

- ventas registradas en cierres confirmados o corregidos;
- gastos incurridos y gastos pagados;
- facturas emitidas y pagos efectuados;
- saldos actuales pendientes y vencidos.

Los totales del período no deben interpretarse automáticamente como ganancia.
Los saldos por pagar y vencidos corresponden al estado actual. Las listas del
informe están paginadas.

### Auditoría — `/dashboard/audit`

Muestra los cambios financieros y administrativos registrados, el usuario que
realizó la acción y, cuando aplica, los datos anteriores y posteriores. Se usa
para revisar correcciones, anulaciones, pagos, cierres y cambios de acceso. La
vista presenta los eventos recientes (hasta 200 registros).

### Usuarios — `/admin/users`

Disponible solo para administradores. Permite crear cuentas de gerente o
administrador y activar o desactivar usuarios. No se puede desactivar la cuenta
del administrador que está usando el panel; conserva siempre una cuenta
administradora activa.

### Cotizaciones — `/dashboard/quotations`

La plantilla muestra los datos fijos de Restaurante Azumi Bistro Inc. y genera
un número anual consecutivo (`COT-AAAA-00001`). El CRM conserva únicamente el
contador por año para evitar números duplicados; no guarda clientes ni
cotizaciones.

Completa los datos del cliente, elige la fecha hasta la que será válida y añade
uno o más conceptos con cantidad y precio unitario. El importe de cada línea,
subtotal, ITBMS del 7% y total se calculan automáticamente usando aritmética
decimal exacta. La dirección del cliente es opcional; los demás datos del
cliente son requeridos. Usa **Descargar PDF limpio** para generar un archivo
listo para imprimir, sin la dirección ni el encabezado del navegador. Si
necesitas modificarlo luego, genera otra cotización; el documento anterior no
se conserva en el sistema.

## 4. Reglas contables importantes

- Los cierres en borrador no forman parte del Dashboard ni de los informes de
  ventas; los cierres confirmados y corregidos sí.
- Una salida de caja reduce el efectivo y el Reporte Z neto, pero no crea por sí
  misma un registro de gasto.
- Un gasto pagado asignado a un cierre reduce el efectivo y el Reporte Z neto de
  esa fecha. No puede asignarse si el resultado quedaría negativo.
- El total bancario y Pedidos Ya se agregan una sola vez al Reporte Z; no se
  vuelven a sumar como otro ingreso.
- Las propinas se mantienen separadas del Reporte Z.
- Registrar una factura crea una obligación; registrar un pago reduce su saldo.
  Los pagos a facturas se reportan aparte de los gastos.
- Un gasto anulado y una factura anulada no deben tratarse como movimiento
  vigente en sus informes.
- Las fechas operativas usan la zona horaria `America/Panama`; las marcas de
  tiempo de auditoría y sesión se almacenan en UTC.
- Las comparaciones de ventas, gastos y pagos del gráfico no equivalen a una
  utilidad neta ni incluyen necesariamente todos los componentes de un estado
  financiero.

## 5. Instalación y configuración técnica

### Requisitos

- Node.js 20.9 o posterior (Node.js 22.x satisface el requisito de Next.js
  16.4.6).
- MySQL o MariaDB accesible desde el servidor de Next.js.
- npm y acceso para instalar las dependencias del proyecto.

### Configurar entorno local

1. Instala dependencias:

   ```powershell
   npm install
   ```

2. Copia `.env.example` a `.env` y completa:

   | Variable | Requerida | Descripción |
   | --- | --- | --- |
   | `DB_HOST` | Sí | Host de MySQL/MariaDB. |
   | `DB_PORT` | No | Puerto de la base de datos; predeterminado `3306`. |
   | `DB_NAME` | Sí | Nombre de la base de datos. |
   | `DB_USER` | Sí | Usuario de la base de datos. |
   | `DB_PASSWORD` | Sí | Contraseña de la base de datos. |
   | `SESSION_SECRET` | Sí | Secreto aleatorio de al menos 32 bytes para firmar tokens de sesión. |

3. Genera un `SESSION_SECRET` desde PowerShell:

   ```powershell
   $bytes = New-Object byte[] 48
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   [Convert]::ToBase64String($bytes)
   $rng.Dispose()
   ```

   Copia el resultado en `SESSION_SECRET` sin comillas. Usa un secreto
   diferente en cada entorno. No lo compartas ni lo guardes en Git. Cambiarlo
   invalida las sesiones existentes.

4. Aplica en orden las migraciones de `database/migrations/` a una base de datos
   vacía. En producción, realiza una copia de seguridad antes de migrar y
   verifica `schema_migrations`; no vuelvas a ejecutar una migración ya
   aplicada.
5. Crea el primer administrador desde una terminal interactiva:

   ```powershell
   npm run admin:create
   ```

   El comando pide nombre, correo y contraseña (mínimo 12 caracteres). Solo
   funciona mientras no exista ningún usuario; después, gestiona las cuentas
   desde el panel.
6. Inicia el servidor de desarrollo:

   ```powershell
   npm run dev
   ```

   Abre `http://localhost:3000/login`.

### Migraciones incluidas

Ejecuta los archivos SQL en orden numérico:

| Migración | Propósito |
| --- | --- |
| `001_initial_schema.sql` | Estructura inicial de usuarios, autenticación, cierres, finanzas, menú y auditoría. |
| `002_cash_closing_pdf_format.sql` | Desglose de pagos por canal y salidas de caja. |
| `003_closing_cash_total.sql` | Total de efectivo del cierre. |
| `004_provider_expenses_and_cash_deductions.sql` | Gastos vinculados a proveedores y descuentos de cierres. |
| `005_retire_menu_editor_accounts.sql` | Desactiva las cuentas del rol de editor de menú retirado. |
| `006_closing_outflows_and_daily_tips.sql` | Total diario de propinas y ajuste auditado de salidas de caja existentes cuando es aplicable. |
| `007_quotation_number_sequences.sql` | Contador anual para números de cotización; no guarda cotizaciones. |

Las migraciones son incrementales; no elimines ni modifiques registros de
`schema_migrations` manualmente para forzar una ejecución.

## 6. Comandos de desarrollo y despliegue

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor local de desarrollo. |
| `npm run build` | Compilación de producción. |
| `npm start` | Ejecuta el servidor de producción después de compilar. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | Verificación de TypeScript sin emitir archivos. |
| `npm test` | Pruebas automatizadas. |
| `npm run admin:create` | Crea el administrador inicial si la tabla de usuarios está vacía. |

Antes de desplegar, configura todas las variables de entorno en el proveedor,
aplica las migraciones pendientes con respaldo de la base de datos, ejecuta la
compilación y confirma que el plan permite ejecutar Next.js con SSR y acceder a
la versión MySQL/MariaDB configurada.

En producción, las redirecciones usan el origen canónico
`https://admin.azumipty.com`. Si el dominio cambia, actualiza el origen en
`src/lib/security/origin.ts` y vuelve a desplegar. La aplicación requiere HTTPS
para su cookie de sesión segura.

## 7. Estructura del proyecto

- `src/app/dashboard/`: páginas del dashboard y módulos del CRM.
- `src/app/admin/users/`: administración de cuentas, solo para administradores.
- `src/app/components/`: navegación, formularios, tarjetas e informes de la
  interfaz.
- `src/app/api/`: endpoints de formularios para autenticación, usuarios,
  cierres y finanzas.
- `src/lib/auth/`: sesiones, roles y permisos.
- `src/lib/finance/`: cálculos financieros, fechas, cierres y auditoría.
- `src/lib/db.ts`: pool de conexiones MySQL.
- `database/migrations/`: cambios versionados de base de datos.
- `scripts/create-admin.mjs`: alta segura del primer administrador.

### Rutas de la aplicación y API

Excepto `/login`, las páginas privadas se sirven desde el servidor y requieren
la sesión y el permiso correspondiente. Las rutas que modifican datos aceptan
`POST` y verifican que la solicitud sea del mismo origen.

| Ruta | Función |
| --- | --- |
| `/login` | Inicio de sesión. |
| `/dashboard` | Resumen mensual o anual. |
| `/dashboard/closings` y `/dashboard/closings/[id]` | Historial y detalle/edición de cierres. |
| `/dashboard/expenses` | Gastos. |
| `/dashboard/suppliers` | Proveedores. |
| `/dashboard/bills` | Facturas y pagos a proveedores. |
| `/dashboard/tips` | Consulta de propinas. |
| `/dashboard/reports` | Informes por rango. |
| `/dashboard/audit` | Auditoría. |
| `/dashboard/quotations` | Plantilla imprimible de cotizaciones (requiere `finance:write`). |
| `/admin/users` | Gestión de usuarios (administrador). |

| Endpoint `POST` | Función |
| --- | --- |
| `/api/auth/login`, `/api/auth/logout` | Crear y cerrar sesión. |
| `/api/admin/users`, `/api/admin/users/[id]/status` | Crear y activar/desactivar usuarios. |
| `/api/finance/closings`, `/api/finance/closings/[id]` | Crear y actualizar cierres. |
| `/api/finance/expenses`, `/api/finance/expenses/[id]`, `/api/finance/expenses/[id]/status` | Crear, editar y anular gastos. |
| `/api/finance/suppliers`, `/api/finance/suppliers/[id]/status` | Crear y activar/desactivar proveedores. |
| `/api/finance/bills`, `/api/finance/bills/[id]/status`, `/api/finance/bills/[id]/payments` | Crear/anular facturas y registrar pagos. |
| `/api/finance/quotations/next-number` | Asignar un número anual consecutivo; guarda solo el contador. |

### Datos principales

La base de datos mantiene usuarios y sesiones; cierres diarios con sus pagos por
canal, salidas y propinas; gastos; proveedores; facturas y pagos; y eventos de
auditoría. Los importes se guardan como decimales con dos posiciones y las
migraciones SQL definen la evolución del esquema.

## 8. Resolución de problemas

| Síntoma | Qué revisar |
| --- | --- |
| No se puede iniciar sesión | Correo y contraseña, estado activo del usuario, rol permitido y variables de base de datos. Si hubo varios intentos fallidos, espera a que pase el bloqueo temporal. |
| Un gerente no ve Usuarios | Es el comportamiento esperado; solo `admin` puede gestionar usuarios. |
| No se puede crear otro cierre para una fecha | Ya existe un cierre, incluso si está en borrador. Abre el existente desde el historial. |
| No se puede guardar una salida o gasto asignado | Comprueba que cada salida tenga descripción e importe y que las deducciones no superen el efectivo contado. |
| El saldo de una factura no coincide | Revisa los pagos ya registrados antes de añadir otro. No dupliques el pago por un error de red; confirma primero si aparece en el detalle o en auditoría. |
| La aplicación falla al conectarse a la base de datos | Revisa `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, disponibilidad del servidor y acceso de red desde el hosting. |
| La URL de redirección muestra `0.0.0.0:3000` | Asegúrate de desplegar la versión vigente. El dominio canónico está fijado en `src/lib/security/origin.ts`; mantenlo actualizado si cambia el dominio. |
| Las sesiones dejan de funcionar tras cambiar configuración | Confirma que `SESSION_SECRET` esté presente y tenga al menos 32 bytes. Rotarlo cierra las sesiones activas. |

## 9. Límites funcionales actuales

- No hay registro público de usuarios ni recuperación automática de contraseña.
- Las cotizaciones se imprimen o guardan como PDF desde el navegador, pero el
  CRM solo conserva su contador anual, no el documento ni sus datos.
- No hay sincronización automática con el POS, pedidos, inventario ni menú
  público.
- El Dashboard y los informes comparan métricas financieras, pero no calculan
  utilidad neta ni sustituyen la contabilidad formal.
- Los informes son consultas del CRM; no representan una integración bancaria
  ni una conciliación automática con los proveedores de pago.
