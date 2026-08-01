import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decode } from "jsonwebtoken";
import { chromium } from "playwright";
import { encryptToken } from "../src/modules/sisfe/crypto.js";
import { sisfeLoginResponseSchema } from "../src/modules/sisfe/schemas.js";

const LOGIN_URL = "https://sisfe.justiciasantafe.gov.ar/login-matriculado";
const SESSION_FILE = fileURLToPath(new URL("../.sisfe-session.json", import.meta.url));

const main = async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log("Se abrio el login de SISFE. Completa matricula, clave y el captcha a mano.");
  console.log("Esperando el login (hasta 5 minutos)...");
  await page.goto(LOGIN_URL);

  const response = await page.waitForResponse(
    (candidate) => candidate.url().includes("/iol/login") && candidate.request().method() === "POST",
    { timeout: 5 * 60 * 1000 },
  );

  const body = sisfeLoginResponseSchema.parse(await response.json());
  const decoded = decode(body.token) as { exp?: number } | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null;

  writeFileSync(SESSION_FILE, JSON.stringify({ tokenCifrado: encryptToken(body.token), expiresAt }, null, 2));

  console.log(`Token capturado. Expira: ${expiresAt ?? "desconocido"}`);
  console.log(`Guardado en ${SESSION_FILE}`);

  await browser.close();
};

main().catch((error) => {
  console.error("Fallo la captura del login:", error);
  process.exit(1);
});
