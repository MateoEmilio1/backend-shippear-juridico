# Plan de trabajo: integración SISFE (Poder Judicial Santa Fe)

Objetivo: consultar el estado de causas/expedientes propios en https://sisfe.justiciasantafe.gov.ar/buscar-expediente y reflejarlo en esta plataforma, sin depender de un browser para el uso diario.

## Diagnóstico

- El sitio es una SPA Angular (`<app-root>`), no HTML server-side.
- Consume una API JSON propia: `apiUrl = https://sisfe.justiciasantafe.gov.ar/iol` (definida en `assets/config/config.json`, cargada en runtime).
- Login: `POST {apiUrl}/login` con body `{ perfil, user, password, idCircunscripcion, idColegio, grecaptchaResponse }` → responde `{ token, perfil, ... }`.
- Autenticación por **token (JWT) tipo Bearer**, no por cookie de sesión. Una vez logueado, el resto de las llamadas (búsqueda y detalle de expediente) son JSON planas con ese token — no requieren browser.
- El login tiene **reCAPTCHA v2 activo** (confirmado contra `/iol/config/getRecaptchaVisible` → `1`).
- Infraestructura detrás de un gateway/WAF (headers `X-ORACLE-DMS-*`); bloquea requests HEAD.

## Decisión de arquitectura

- **No se usa un servicio de auto-resolución de captcha (CapSolver/2captcha ni similar).** El reCAPTCHA es un control de seguridad puesto deliberadamente por el organismo para evitar acceso automatizado; nuestras credenciales autorizan al usuario humano, no autorizan a evadir ese control. Descartado.
- Enfoque adoptado: **login semi-manual + reuso de token**.
  - Un humano resuelve el login (y el captcha) manualmente, de tanto en tanto, con un script Playwright de uso puntual (no corre en producción 24/7).
  - El token resultante se guarda cifrado y se reutiliza para todas las consultas automatizadas hasta que expira.
  - El resto del sistema (búsquedas periódicas, comparación de estado, notificaciones) funciona con **HTTP plano (axios)**, sin browser.

## Fases y tareas

### Fase 0 — Confirmar vida útil del token ✅
- [x] Login manual capturando el request `login` en DevTools (Network → Fetch/XHR).
- [x] Decodificar el `token` (jwt.io) y anotar `iat`/`exp`.
- [x] Documentar cuánto dura la sesión real → define la frecuencia de re-login manual.

**Resultado:** el JWT dura **2 horas exactas** (`exp - iat = 7200s`). Payload:
```json
{
  "sub": "matriculado:<idMatriculado>",
  "CLAIM_TOKEN": "ROLE_ADMIN",
  "iat": 1785597896,
  "iss": "ISSUER",
  "exp": 1785605096
}
```
Algoritmo `HS256` (firma simétrica — no la podemos generar nosotros sin el secreto del servidor, obviamente, pero no hace falta: solo consumimos el token que nos da el login).

Con 2hs de duración, el re-login manual (Fase 3) tiene que correr cada ~2hs si querés monitoreo continuo, o simplemente antes de cada tanda de consultas si el uso es más esporádico.

### Fase 1 — Mapear los endpoints de negocio ✅
- [x] Capturar el request completo (URL, headers, body) de búsqueda.
- [x] Capturar el request completo de detalle (`findById`).
- [x] Documentar ambos payloads (request y response).

**Búsqueda de expedientes — confirmado:**
```
GET {apiUrl}/expedientes/findByFilter?page=1&size=25&diasNovedades=10
Authorization: Bearer <token>
Accept: application/json
```
Sin `matricula` en la URL — el backend la resuelve del claim `sub` del token (`matriculado:<id>`). Otros query params posibles (vistos en el bundle): `localidad`, `organismo`, `cuij`, `sufijo`, `numero`, `bis`, `caratula` — a confirmar cuando se use el formulario de filtros completo.

Response:
```json
{
  "totalElements": null,
  "lista": [
    {
      "id": 10067939116,
      "expediente": "21-04258078-0(1390/2025)",
      "expCaratula": "ACOSTA JOSE OCTAVIO C/ RUTA 40 E HIJOS SRL S/ COBRO DE PESOS - RUBROS LABORALES",
      "expFechaInicio": "05/09/2025",
      "fechaActualizacion": "31/07/2026",
      "radicacionActual": "Juzg. 1ra. Inst. Laboral 8ª . Nom. - ROSARIO",
      "expVisible": "S",
      "expDigital": 1,
      "expUbicacion": "EN CASILLERO. - desde el 31/07/2026 12:41"
    }
  ]
}
```
`expUbicacion` es el campo que interesa para detectar movimiento (cambia de texto/fecha cuando el expediente se mueve) — candidato natural para el diff de `ExpedienteSnapshot` en la Fase 4.

**Detalle de expediente — confirmado:**
```
GET {apiUrl}/expedientes/findById?idExpediente=<id>
Authorization: Bearer <token>
Accept: application/json
```
`<id>` es el `id` numérico que devuelve el endpoint de búsqueda (no el número de expediente con guiones).

Response:
```json
{
  "expCaratula": "ACOSTA JOSE OCTAVIO C/ RUTA 40 E HIJOS SRL S/ COBRO DE PESOS - RUBROS LABORALES",
  "cuijSufijo": "21-04258078-0",
  "numeroExpediente": "1390/2025",
  "radicado": "Juzg. 1ra. Inst. Laboral 8ª . Nom. SEC.UNICA",
  "localidad": "ROSARIO",
  "fechaIngresoMEU": "05/09/2025",
  "expUbicacion": "EN CASILLERO. - desde el 31/07/2026 12:41",
  "ultimaActualizacionDelExpediente": "31/07/2026 13:32",
  "fechaActualizacionSisfeOnline": "01/08/2026 12:15",
  "organismoCodigo": "201037",
  "expVisible": "S",
  "expPrincipal": null,
  "expAcumulado": null,
  "cuijExpPrincipal": null,
  "anio": "2025",
  "expDigital": 1
}
```
`ultimaActualizacionDelExpediente` es más preciso que `expUbicacion` para detectar cambios (tiene timestamp exacto) — mejor candidato todavía para el diff de la Fase 4.

Con esto la Fase 1 queda cerrada: tenemos login, búsqueda y detalle mapeados end-to-end.

### Fase 2 — Cliente HTTP (`sisfe-client`) ✅
- [x] Crear `src/modules/sisfe/` (originalmente se creó como `src/sisfe/` porque el repo era flat; al mergear "version 1" apareció `src/modules/` con `cases.ts`, `catalogs.ts`, etc., así que se movió ahí para quedar consistente).
- [x] Instalar `axios`.
- [x] Crear `src/modules/sisfe/schemas.ts` con los tipos zod de login, búsqueda y detalle (basados en Fase 1).
- [x] Crear `src/modules/sisfe/client.ts`: `createSisfeClient(token)` con `buscarExpedientes` y `obtenerExpediente`, tipado y parseado con zod.

Falta todavía: schema de login no se usa aún (no hay endpoint propio que llame a `/login` — eso lo dispara el script de Fase 3). Queda declarado en `schemas.ts` para cuando se conecte.

### Fase 3 — Módulo de autenticación semi-manual (Playwright) ✅ (parcial)
- [x] Script standalone `scripts/sisfe-login.ts` (`npm run sisfe:login`) que abre Chromium headed.
- [x] El humano completa matrícula/clave y resuelve el captcha a mano.
- [x] El script espera la response de `POST /iol/login` (hasta 5 min), extrae `token`, decodifica el `exp` (con `jsonwebtoken`, que ya era dependencia) y lo guarda.
- [ ] **Pendiente:** hoy lo guarda sin cifrar en `.sisfe-session.json` (gitignored) en la raíz del repo, como placeholder. Cuando exista el modelo `SisfeSession` (Fase 4), reemplazar ese `writeFileSync` por persistencia cifrada en DB.

### Fase 4 — Persistencia (Prisma) ✅ (schema listo, falta migrar)
- [x] Modelo `SisfeSession` (`tokenCifrado`, `expiresAt`).
- [x] Modelo `ExpedienteTracked` (`sisfeId` único, `numero`, `caratula`).
- [x] Modelo `ExpedienteSnapshot` (`ubicacion`, `radicacion`, `actualizadoEn`, relación a `ExpedienteTracked`).
- [ ] **Pendiente (no lo pude hacer yo, no hay DB conectada en este entorno):** crear el proyecto en **Supabase** (decisión del usuario para la DB de esta fase), tomar su `DATABASE_URL` y correr `npm run prisma:migrate` para generar y aplicar la migración. El schema ya está validado (`prisma validate` y `prisma generate` corrieron OK con una URL descartable).
- [x] Helper de cifrado del token (`src/modules/sisfe/crypto.ts`, AES-256-GCM). Ya conectado a `scripts/sisfe-login.ts` — el `.sisfe-session.json` local ahora guarda el token cifrado (mismo formato que va a tener la columna `tokenCifrado`), como paso intermedio hasta que exista Supabase y se pueda escribir directo a `SisfeSession`.

### Fase 5 — Scheduler ✅ (código listo, no ejecutable hasta que exista Supabase)
- [x] `src/modules/sisfe/dates.ts`: parsea las fechas de SISFE (`dd/MM/yyyy HH:mm`) a `Date`.
- [x] `src/modules/sisfe/scheduler.ts`: `runSchedulerCycle()` recorre `ExpedienteTracked`, pide el detalle con `sisfe-client` usando la sesión vigente (`SisfeSession`, desencriptada), y compara `ubicacion`/`radicacion`/`actualizadoEn` contra el último `ExpedienteSnapshot`. Si cambió, crea un snapshot nuevo y loguea el cambio.
- [x] `startSisfeScheduler()` registra el ciclo cada 30 minutos con `node-cron`, arrancado desde `src/index.ts` junto con el servidor Express (no hace falta un proceso aparte).
- [ ] **No implementado a propósito:** el "genera evento/notificación" del plan original hoy es solo un `console.log`/`console.error` — no hay canal de notificación (mail/webhook/etc.) definido todavía. Se agrega cuando se decida cómo se quiere avisar.
- **No se puede correr end-to-end todavía:** depende de que exista Supabase + migración (Fase 4 pendiente) y de que haya al menos una fila en `SisfeSession` y `ExpedienteTracked` (esto último — cómo se cargan expedientes a trackear — es la Fase 7, todavía no está resuelto quién los inserta).

### Fase 6 — Manejo de expiración de sesión
- [ ] Si `sisfe-client` recibe 401, marcar `SisfeSession` como inválida.
- [ ] Disparar alerta clara ("hace falta re-loguear a mano") en vez de fallar el cron en silencio.

### Fase 7 — Exposición en la API propia
- [ ] Endpoints Express sobre `ExpedienteTracked`/`ExpedienteSnapshot` para que el frontend consuma el estado consolidado.

## Notas de seguridad

- Nunca commitear matrícula, clave ni tokens reales — usar variables de entorno / storage cifrado.
- El token debe guardarse cifrado en DB, no en texto plano.
- Cualquier captura de pantalla o request pegado en tickets/PRs debe redactar credenciales y token.
