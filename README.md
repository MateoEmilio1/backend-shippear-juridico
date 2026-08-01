# Backend Shippear Juridico

API Express + TypeScript + Prisma + PostgreSQL con autenticacion OTP, workspaces y gestion juridica normalizada.

## Dominio incluido

- Causas e identificadores judiciales.
- Personas involucradas y asignaciones.
- Catalogo penal de 860 figuras.
- Etapas procesales e historial.
- Privacion de libertad y establecimientos.
- Agenda, alertas, notas, recursos y auditoria.

## Desarrollo

1. Copiar `.env.example` a `.env` y configurar `DATABASE_URL` y `JWT_SECRET`.
2. Ejecutar `npm run prisma:deploy`.
3. Ejecutar `npm run dev`.

## Railway

- Agregar un servicio PostgreSQL y referenciar su `DATABASE_URL` en el backend.
- Configurar `JWT_SECRET`, `FRONTEND_URL` y `NODE_ENV=production`.
- Build command: `npm run build`.
- Pre-deploy command: `npm run prisma:deploy && npm run prisma:seed`.
- Start command: `npm start`.

Estos comandos ya estan declarados en `railway.toml`, por lo que cada despliegue aplica las migraciones pendientes antes de iniciar la API.

El seed es idempotente y carga el workspace inicial, etapas procesales, unidades penitenciarias y el catalogo de 860 figuras penales extraido del prototipo original.

El endpoint `POST /api/auth/request-otp` devuelve el OTP en la respuesta intencionalmente. Antes de produccion debe reemplazarse por email/SMS y dejar de exponer el campo `otp`.

La API publica actual es https://backend-sistema-juridico-production.up.railway.app.
