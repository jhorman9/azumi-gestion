# CRM gerencial para restaurante

Aplicación privada para registrar cierres diarios del POS, gastos, proveedores,
cuentas por pagar y administrar el menú digital. No reemplaza el POS ni crea
una web pública de pedidos.

## Desarrollo local

Requisitos: Node.js compatible con Next.js 16 y una instancia MySQL accesible
desde el servidor de desarrollo.

1. Instala dependencias: `npm install`
2. Copia `.env.example` a `.env.local` y configura la conexión MySQL.
3. Inicia el servidor: `npm run dev`

Scripts disponibles: `npm run dev`, `npm run build`, `npm run lint` y
`npm run typecheck`.

## Decisiones y alcance

- Next.js App Router, TypeScript estricto, CSS estándar y MySQL mediante
  `mysql2/promise`; no se usa ORM.
- La autenticación y autorización se implementarán en el servidor. No habrá
  registro público.
- La aplicación administra una sola empresa. El POS y la web pública del menú
  permanecen externos y no se sincronizan automáticamente.
- La arquitectura, el plan por fases y las decisiones contables están en
  [`docs/architecture.md`](./docs/architecture.md).
- Las migraciones SQL se versionarán en `database/migrations/` y se ejecutarán
  desde phpMyAdmin después de validar la versión MySQL disponible.

## Despliegue

La compatibilidad final con Hostinger depende del plan contratado, la versión
de Node.js y la versión de MySQL disponibles. Verifica esos datos antes de
desplegar; no se presupone que cualquier plan soporte Next.js SSR.
