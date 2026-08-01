# Backend Shippear Juridico

API Express + TypeScript + Prisma + PostgreSQL con autenticacion OTP de desarrollo.

## Desarrollo

1. Copiar `.env.example` a `.env` y configurar `DATABASE_URL` y `JWT_SECRET`.
2. Ejecutar `npm run prisma:deploy`.
3. Ejecutar `npm run dev`.

## Railway

- Agregar un servicio PostgreSQL y referenciar su `DATABASE_URL` en el backend.
- Configurar `JWT_SECRET`, `FRONTEND_URL` y `NODE_ENV=production`.
- Build command: `npm run build && npm run prisma:deploy`.
- Start command: `npm start`.

El endpoint `POST /api/auth/request-otp` devuelve el OTP en la respuesta intencionalmente. Antes de produccion debe reemplazarse por email/SMS y dejar de exponer el campo `otp`.
