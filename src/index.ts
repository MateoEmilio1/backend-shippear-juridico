import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import { config } from "./config.js";
import { logout, me, requestOtp, verifyOtp } from "./auth.js";
import { requireAuth } from "./middleware/auth.js";
import { getCatalogs } from "./modules/catalogs.js";
import { downloadAgentDocument, getAgentCase, listAgentCases, requireAgentApiKey } from "./modules/agent.js";
import { getDashboard } from "./modules/dashboard.js";
import { archiveCase, createCase, createNote, createResource, getCase, listCases, updateCase } from "./modules/cases.js";
import { createEvent, deleteEvent, listEvents, updateEvent } from "./modules/events.js";
import { startSisfeScheduler } from "./modules/sisfe/scheduler.js";
import { createSisfeConnectTicket, downloadSisfeDocument, finishSisfeBrowserImport, getSisfeExpediente, getSisfeStatus, importSisfeBrowserBatch, importSisfeBrowserDocument, importSisfeBrowserSnapshot, importSisfeSnapshot, listSisfeExpedientes, planSisfeBrowserImport, receiveSisfeSession, registerSisfeBrowserDocuments, startSisfeBrowserImport, triggerSisfeSyncNow, updateSisfeDocumentPriority, viewSisfeDocument } from "./modules/sisfe/http.js";
import { asyncHandler, HttpError } from "./utils/http.js";

const app = express();

app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin.startsWith("chrome-extension://") || config.frontendUrls.includes(origin.replace(/\/$/, ""))) return callback(null, true);
      callback(new Error("Origen no permitido por CORS"));
    },
    credentials: true,
  }),
);
app.use(cookieParser());

app.post("/api/integrations/sisfe/session", express.json({ limit: "1mb" }), asyncHandler(receiveSisfeSession));
app.post("/api/integrations/sisfe/import", express.json({ limit: "20mb" }), asyncHandler(importSisfeSnapshot));
app.post("/api/integrations/sisfe/browser-import", express.json({ limit: "20mb" }), asyncHandler(importSisfeBrowserSnapshot));
app.post("/api/integrations/sisfe/browser-import/start", express.json({ limit: "1mb" }), asyncHandler(startSisfeBrowserImport));
app.post("/api/integrations/sisfe/browser-import/plan", express.json({ limit: "2mb" }), asyncHandler(planSisfeBrowserImport));
app.post("/api/integrations/sisfe/browser-import/batch", express.json({ limit: "3mb" }), asyncHandler(importSisfeBrowserBatch));
app.post("/api/integrations/sisfe/browser-import/finish", express.json({ limit: "1mb" }), asyncHandler(finishSisfeBrowserImport));
app.post("/api/integrations/sisfe/browser-import/document", express.raw({ type: () => true, limit: "30mb" }), asyncHandler(importSisfeBrowserDocument));
app.post("/api/integrations/sisfe/browser-import/document-manifest", express.json({ limit: "2mb" }), asyncHandler(registerSisfeBrowserDocuments));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "shippear-juridico" }));
app.get("/api/agent/cases", requireAgentApiKey, asyncHandler(listAgentCases));
app.get("/api/agent/cases/:id", requireAgentApiKey, asyncHandler(getAgentCase));
app.get("/api/agent/documents/:id/download", requireAgentApiKey, asyncHandler(downloadAgentDocument));
app.post("/api/auth/request-otp", requestOtp);
app.post("/api/auth/verify-otp", verifyOtp);
app.get("/api/auth/me", requireAuth, asyncHandler(me));
app.post("/api/auth/logout", logout);

app.use("/api", asyncHandler(requireAuth));
app.get("/api/dashboard", asyncHandler(getDashboard));
app.get("/api/catalogs", asyncHandler(getCatalogs));
app.get("/api/cases", asyncHandler(listCases));
app.post("/api/cases", asyncHandler(createCase));
app.get("/api/cases/:id", asyncHandler(getCase));
app.put("/api/cases/:id", asyncHandler(updateCase));
app.delete("/api/cases/:id", asyncHandler(archiveCase));
app.post("/api/cases/:id/notes", asyncHandler(createNote));
app.post("/api/cases/:id/resources", asyncHandler(createResource));
app.get("/api/events", asyncHandler(listEvents));
app.post("/api/cases/:caseId/events", asyncHandler(createEvent));
app.patch("/api/events/:id", asyncHandler(updateEvent));
app.delete("/api/events/:id", asyncHandler(deleteEvent));
app.get("/api/sisfe/status", asyncHandler(getSisfeStatus));
app.post("/api/sisfe/connect-ticket", asyncHandler(createSisfeConnectTicket));
app.post("/api/sisfe/sync", asyncHandler(triggerSisfeSyncNow));
app.get("/api/sisfe/expedientes", asyncHandler(listSisfeExpedientes));
app.get("/api/sisfe/expedientes/:id", asyncHandler(getSisfeExpediente));
app.get("/api/sisfe/documents/:id/download", asyncHandler(downloadSisfeDocument));
app.get("/api/sisfe/documents/:id/view", asyncHandler(viewSisfeDocument));
app.patch("/api/sisfe/documents/:id/priority", asyncHandler(updateSisfeDocumentPriority));

app.use((_request, response) => response.status(404).json({ error: "Ruta no encontrada" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return void response.status(400).json({ error: "Datos invalidos", issues: error.issues });
  if (error instanceof HttpError) return void response.status(error.status).json({ error: error.message });
  console.error(error);
  response.status(500).json({ error: "Error interno" });
});

startSisfeScheduler();

app.listen(config.port, () => console.log(`API disponible en http://localhost:${config.port}`));
