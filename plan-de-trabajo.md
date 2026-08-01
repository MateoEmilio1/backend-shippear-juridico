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

### Fase 1 — Mapear los endpoints de negocio
- [ ] Capturar el request completo (URL, headers, body) de `busquedaExpediente`.
- [ ] Capturar el request completo de `consultaExpediente` / `findExpedienteDigitalById` (detalle).
- [ ] Documentar ambos payloads (request y response) acá o en un archivo aparte.

### Fase 2 — Cliente HTTP (`sisfe-client`)
- [ ] Crear `src/modules/sisfe/`.
- [ ] Instalar `axios`.
- [ ] Crear `src/modules/sisfe/sisfe.schemas.ts` con los tipos zod de login, búsqueda y detalle (basados en Fase 1).
- [ ] Crear `src/modules/sisfe/sisfe.client.ts`: wrapper tipado sobre `{apiUrl}` que agrega el Bearer token a cada llamada.

### Fase 3 — Módulo de autenticación semi-manual (Playwright)
- [ ] Script standalone (`scripts/sisfe-login.ts` o similar, fuera del flujo de request/response del server) que abre browser headed.
- [ ] El humano completa matrícula/clave y resuelve el captcha.
- [ ] El script intercepta la response de `/login`, extrae `token` y lo persiste cifrado (Fase 4).

### Fase 4 — Persistencia (Prisma)
- [ ] Modelo `SisfeSession` (token cifrado, expiración).
- [ ] Modelo `ExpedienteTracked` (expedientes que se siguen).
- [ ] Modelo `ExpedienteSnapshot` (último estado conocido, para diffear cambios).

### Fase 5 — Scheduler
- [ ] Cron job que recorre `ExpedienteTracked`, consulta vía `sisfe-client` con el token vigente.
- [ ] Diff contra el último `ExpedienteSnapshot`; si hay cambios, genera evento/notificación.

### Fase 6 — Manejo de expiración de sesión
- [ ] Si `sisfe-client` recibe 401, marcar `SisfeSession` como inválida.
- [ ] Disparar alerta clara ("hace falta re-loguear a mano") en vez de fallar el cron en silencio.

### Fase 7 — Exposición en la API propia
- [ ] Endpoints Express sobre `ExpedienteTracked`/`ExpedienteSnapshot` para que el frontend consuma el estado consolidado.

## Notas de seguridad

- Nunca commitear matrícula, clave ni tokens reales — usar variables de entorno / storage cifrado.
- El token debe guardarse cifrado en DB, no en texto plano.
- Cualquier captura de pantalla o request pegado en tickets/PRs debe redactar credenciales y token.
