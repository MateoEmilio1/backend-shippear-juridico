import "dotenv/config";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} no esta definido`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 8000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  frontendUrls: (process.env.FRONTEND_URL ?? "http://localhost:3000")
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean),
  otpExpirationMinutes: Number(process.env.OTP_EXPIRATION_MINUTES ?? 5),
  sessionDays: Number(process.env.AUTH_SESSION_DAYS ?? 7),
  nodeEnv: process.env.NODE_ENV ?? "development",
  allowAnyEmail: process.env.ALLOW_ANY_EMAIL !== "false",
  allowedEmails: (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  sisfeSyncEnabled: process.env.SISFE_SYNC_ENABLED === "true",
  sisfeSyncCron: process.env.SISFE_SYNC_CRON?.trim() || "0 7 * * *",
  sisfeReminderCron: process.env.SISFE_REMINDER_CRON?.trim() || "55 6 * * *",
  sisfeRetryAttempts: Math.max(0, Number(process.env.SISFE_RETRY_ATTEMPTS ?? 2)),
  sisfeRetryDelayMinutes: Math.max(1, Number(process.env.SISFE_RETRY_DELAY_MINUTES ?? 10)),
  sisfeWorkspaceSlug: process.env.SISFE_WORKSPACE_SLUG?.trim() || "antenucci-penal",
  sisfeConnectSecret: process.env.SISFE_CONNECT_SECRET?.trim() || "",
  sisfeAlertWebhookUrl: process.env.SISFE_ALERT_WEBHOOK_URL?.trim() || "",
  agentApiEnabled: process.env.AGENT_API_ENABLED === "true",
  agentApiKey: process.env.AGENT_API_KEY?.trim() || "",
  agentWorkspaceSlug: process.env.AGENT_WORKSPACE_SLUG?.trim() || process.env.SISFE_WORKSPACE_SLUG?.trim() || "antenucci-penal",
};
