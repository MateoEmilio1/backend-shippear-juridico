import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";
import { createSisfeClient } from "../src/modules/sisfe/client.js";
import { encryptToken } from "../src/modules/sisfe/crypto.js";
import { sisfeLoginResponseSchema } from "../src/modules/sisfe/schemas.js";

const LOGIN_URL = "https://sisfe.justiciasantafe.gov.ar/login-matriculado";
const SESSION_FILE = fileURLToPath(new URL("../.sisfe-session.json", import.meta.url));

const main = async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: "es-AR" });
  const page = await context.newPage();

  console.log("Se abrio el login oficial de SISFE.");
  console.log("Playwright selecciona Rosario y Abogados; el captcha siempre se resuelve a mano.");
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.locator("#circunscripcion").selectOption({ label: "Rosario" });
  await page.locator("#colegio").selectOption({ label: "Abogados" });

  if (process.env.SISFE_MATRICULA) await page.locator("#matricula").fill(process.env.SISFE_MATRICULA);
  if (process.env.SISFE_CLAVE) await page.locator("#password").fill(process.env.SISFE_CLAVE);

  console.log("Completa los campos que falten, resolve el captcha y presiona Ingresar (hasta 15 minutos).");

  const response = await page.waitForResponse(
    (candidate) => candidate.url().includes("/iol/login") && candidate.request().method() === "POST",
    { timeout: 15 * 60 * 1000 },
  );

  if (!response.ok()) throw new Error(`SISFE rechazo el login (HTTP ${response.status()})`);
  const body = sisfeLoginResponseSchema.parse(await response.json());
  const decoded = jwt.decode(body.token) as { exp?: number } | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null;

  const client = createSisfeClient(body.token);
  const summaries = await client.buscarTodosExpedientes({ size: 100 });
  console.log(`Acceso verificado: SISFE respondio correctamente (${summaries.length} expedientes).`);

  const backendUrl = process.env.SISFE_BACKEND_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "");
  if (backendUrl && process.env.SISFE_CONNECT_SECRET) {
    const upload = await fetch(`${backendUrl.replace(/\/$/, "")}/api/integrations/sisfe/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sisfe-connect-secret": process.env.SISFE_CONNECT_SECRET },
      body: JSON.stringify({ token: body.token, workspaceSlug: process.env.SISFE_WORKSPACE_SLUG, syncMode: "local" }),
    });
    if (!upload.ok) throw new Error(`No se pudo enviar la sesión al backend (HTTP ${upload.status})`);
    console.log("Sesion enviada al backend. Leyendo expedientes desde esta computadora...");

    const entries: Array<{ summary: (typeof summaries)[number]; detail: Awaited<ReturnType<typeof client.obtenerExpediente>>; movements: Awaited<ReturnType<typeof client.obtenerNovedades>> }> = [];
    const queue = [...summaries];
    let completed = 0;
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const summary = queue.shift();
        if (!summary) return;
        const [detail, movements] = await Promise.all([
          client.obtenerExpediente(summary.id),
          client.obtenerNovedades(summary.id),
        ]);
        entries.push({ summary, detail, movements });
        completed++;
        process.stdout.write(`\rLeyendo SISFE: ${completed}/${summaries.length}`);
      }
    });
    await Promise.all(workers);
    process.stdout.write("\n");

    const imported = await fetch(`${backendUrl.replace(/\/$/, "")}/api/integrations/sisfe/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sisfe-connect-secret": process.env.SISFE_CONNECT_SECRET },
      body: JSON.stringify({ entries, workspaceSlug: process.env.SISFE_WORKSPACE_SLUG }),
    });
    if (!imported.ok) throw new Error(`No se pudo importar la información en el backend (HTTP ${imported.status})`);
    const result = await imported.json() as { syncedCount: number; foundCount: number; movementCount: number; errorCount: number };
    console.log(`Importación terminada: ${result.syncedCount}/${result.foundCount} expedientes, ${result.movementCount} novedades nuevas, ${result.errorCount} errores.`);
  } else if (process.env.SISFE_TOKEN_KEY) {
    writeFileSync(SESSION_FILE, JSON.stringify({ tokenCifrado: encryptToken(body.token), expiresAt }, null, 2), {
      mode: 0o600,
    });
    console.log(`Sesion cifrada guardada en ${SESSION_FILE}`);
  } else {
    console.warn("No hay backend/clave de cifrado configurados: la sesion no se guardo.");
  }

  console.log(`La sesion expira: ${expiresAt ?? "desconocido"}`);

  await browser.close();
};

main().catch((error) => {
  console.error("Fallo la captura del login:", error);
  process.exit(1);
});
