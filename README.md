# CRM gerencial para restaurante

Aplicación privada para registrar cierres diarios del POS, gastos, proveedores,
cuentas por pagar y reportes. No reemplaza el POS ni crea una web pública de
pedidos.

El MVP gerencial incluye autenticación privada, cierres diarios auditables,
registro de gastos, directorio de proveedores, facturas con pagos parciales y
reportes por período. Los reportes separan ventas, gastos incurridos, pagos y
obligaciones; no calculan utilidad neta.

## Resumen financiero

El Dashboard muestra por mes o año:

- **Saldo total sin gastos:** Reporte Z neto de los cierres confirmados o
  corregidos del período.
- **Gastos del período:** gastos pagados, agrupados por fecha del gasto.
- **Saldo total con gastos:** saldo sin gastos menos los gastos del período;
  puede ser negativo y no representa utilidad neta.
- **Pagos pendientes y vencidos:** saldos actuales de facturas de proveedores,
  independientes del rango seleccionado y del saldo del período.

Los gastos reducen el saldo del período, pero no modifican cierres diarios. Las
salidas de caja registradas dentro de un cierre sí reducen el efectivo y el
Reporte Z de ese cierre. Los pagos de facturas reducen el saldo por pagar y no
se registran de nuevo como gastos.

## Desarrollo local

Requisitos: Node.js compatible con Next.js 16 y una instancia MySQL/MariaDB
accesible desde el servidor de desarrollo.

1. Instala dependencias: `npm install`
2. Copia `.env.example` a `.env` y configura la conexión MySQL.
3. Genera un valor aleatorio para `SESSION_SECRET` en PowerShell:

   ```powershell
   $bytes = New-Object byte[] 48
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   [Convert]::ToBase64String($bytes)
   $rng.Dispose()
   ```

   Copia el resultado en `.env`, reemplazando el marcador:
   `SESSION_SECRET=valor_generado`. No agregues comillas ni compartas el valor.
   Reinicia el servidor si ya estaba iniciado. En producción, configura un
   secreto distinto en las variables de entorno del proveedor; no subas `.env`
   a Git. Cambiarlo invalida las sesiones existentes.
4. Aplica en orden las migraciones de `database/migrations/` desde phpMyAdmin.
5. Crea la primera cuenta administradora con `npm run admin:create` desde una
   terminal interactiva y con `.env` configurado.
6. Inicia el servidor: `npm run dev` y entra en `/login`.

Scripts disponibles: `npm run dev`, `npm run build`, `npm run lint`,
`npm run typecheck` y `npm run admin:create`.

## Documentación

- [Manual completo del Mini CRM](./docs/mini-crm.md): módulos, reglas
  financieras, procedimientos de uso, instalación, despliegue y resolución de
  problemas.
- [Arquitectura y plan inicial](./docs/architecture.md): contexto técnico e
  histórico; para el comportamiento vigente, consulta el manual completo.

## Decisiones y alcance

- Next.js App Router, TypeScript estricto, CSS estándar y MySQL/MariaDB mediante
  `mysql2/promise`; no se usa ORM.
- La autenticación y autorización se validan en el servidor. No hay registro
  público.
- La aplicación administra una sola empresa. El POS y la web pública del menú
  permanecen externos y no se sincronizan automáticamente.
- El primer administrador se crea por CLI; luego los administradores gestionan
  usuarios desde el panel.
- Las migraciones SQL están versionadas en `database/migrations/` y deben
  aplicarse en orden a la base de datos.

## Despliegue

El usuario confirmó que su plan de Hostinger ofrece Node.js 22.x. Next.js
16.4.6 requiere Node.js 20.9 o posterior, así que 22.x cumple ese requisito.
Antes de desplegar, verifica que el plan permita Next.js SSR, la versión de
MySQL/MariaDB y los límites de recursos.
