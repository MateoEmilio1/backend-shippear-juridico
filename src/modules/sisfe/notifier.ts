import { config } from "../../config.js";

export type SisfeNotification = {
  event: "LOGIN_REQUIRED" | "SYNC_SUCCESS" | "SYNC_PARTIAL" | "SYNC_FAILED";
  title: string;
  message: string;
  workspaceId: string;
  details?: Record<string, string | number | null>;
};

export const notifySisfe = async (notification: SisfeNotification): Promise<void> => {
  if (!config.sisfeAlertWebhookUrl) return;
  const dashboardUrl = config.frontendUrls[0] ? `${config.frontendUrls[0]}/sisfe` : null;
  const response = await fetch(config.sisfeAlertWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...notification,
      dashboardUrl,
      text: `${notification.title}: ${notification.message}${dashboardUrl ? ` ${dashboardUrl}` : ""}`,
      sentAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`El webhook SISFE respondió HTTP ${response.status}`);
};

export const notifySisfeSafely = async (notification: SisfeNotification): Promise<void> => {
  try {
    await notifySisfe(notification);
  } catch (error) {
    console.error("[sisfe] no se pudo enviar la notificación", error);
  }
};
