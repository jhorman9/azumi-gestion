# Migraciones MySQL

Los cambios de esquema se agregarán como scripts SQL numerados (`001_...sql`,
`002_...sql`) y se ejecutarán en orden desde phpMyAdmin. No se ejecutan
migraciones automáticamente al iniciar la aplicación.

Antes de escribir/aplicar la migración inicial, confirmar la versión MySQL del
plan contratado y revisar tipos, índices, claves foráneas y restricciones
disponibles. Registrar la versión aplicada y probar el script en una base de
datos desechable antes de producción.
