# Migraciones MySQL

Los cambios de esquema se agregan como scripts SQL numerados (`001_...sql`,
`002_...sql`) y se ejecutan en orden desde phpMyAdmin. No se ejecutan
migraciones automáticamente al iniciar la aplicación.

`001_initial_schema.sql` define el esquema inicial de autenticación, gerencia,
finanzas, menú y promociones. Está diseñado para MySQL/MariaDB con InnoDB;
`CHECK` y JSON requieren una versión compatible. La conexión configurada en
`.env` respondió con MariaDB 11.8.9. Confirma que ese servidor corresponde al
destino de despliegue antes de aplicar la migración.

`002_cash_closing_pdf_format.sql` adapta los cierres al formulario aprobado:
Reporte Z y Pedidos Ya separados, matriz bancaria, salidas de caja y propinas
por persona. Es aditiva: conserva los cierres y datos del formato anterior; no
convierte los medios de pago genéricos porque no existe una equivalencia fiable.

`003_closing_cash_total.sql` añade el campo de efectivo contado/registrado.
El valor se almacena por cierre y no se deriva de las ventas, pagos bancarios o
salidas de caja.

`004_provider_expenses_and_cash_deductions.sql` elimina las categorías y sus
plantillas recurrentes, y simplifica los gastos a proveedor, importe y método
de pago (efectivo, tarjeta o Yappy). Permite asignar un gasto al cierre de una
fecha y conserva los importes brutos para recalcular y auditar las deducciones.

Selecciona la base correcta en phpMyAdmin, revisa el script y ejecútalo una
sola vez. El script registra su versión en `schema_migrations` al final. La
migración inicial se aplicó manualmente a la base configurada durante el
desarrollo; la aplicación no ejecuta migraciones al iniciar. Después, ejecuta
`npm run admin:create` desde una terminal interactiva para crear la primera
cuenta; la contraseña se solicita sin mostrarla en pantalla. Haz una copia de
seguridad y prueba primero en una base desechable antes de producción.
