# CRM gerencial para restaurante

Aplicación privada para registrar cierres diarios del POS, gastos, proveedores,
cuentas por pagar y administrar el menú digital. No reemplaza el POS ni crea
una web pública de pedidos.

## Desarrollo local

Requisitos: Node.js compatible con Next.js 16 y una instancia MySQL/MariaDB
accesible desde el servidor de desarrollo.

1. Instala dependencias: `npm install`
2. Copia `.env.example` a `.env` y configura la conexión MySQL.
3. Aplica la migración inicial desde phpMyAdmin.
4. Crea la primera cuenta administradora con `npm run admin:create` desde una
   terminal interactiva y con `.env` configurado.
5. Inicia el servidor: `npm run dev` y entra en `/login`.

Scripts disponibles: `npm run dev`, `npm run build`, `npm run lint`,
`npm run typecheck` y `npm run admin:create`.

## Decisiones y alcance

- Next.js App Router, TypeScript estricto, CSS estándar y MySQL/MariaDB mediante
  `mysql2/promise`; no se usa ORM.
- La autenticación y autorización se implementarán en el servidor. No habrá
  registro público.
- La aplicación administra una sola empresa. El POS y la web pública del menú
  permanecen externos y no se sincronizan automáticamente.
- No existe registro público. El primer administrador se crea por CLI; luego
  los administradores gestionan usuarios desde el panel.
- La arquitectura, el plan por fases y las decisiones contables están en
  [`docs/architecture.md`](./docs/architecture.md).
- Las migraciones SQL se versionarán en `database/migrations/` y se ejecutarán
  desde phpMyAdmin después de validar la versión MySQL disponible.

## Despliegue

El usuario confirmó que su plan de Hostinger ofrece Node.js 22.x. Next.js
16.4.6 requiere Node.js 20.9 o posterior, así que 22.x cumple ese requisito.
Antes de desplegar, verifica que el plan permita Next.js SSR, la versión de
MySQL/MariaDB y los límites de recursos.
