import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import { config } from "./config.js";
import { logout, me, requestOtp, verifyOtp } from "./auth.js";
import { requireAuth } from "./middleware/auth.js";
import { getCatalogs } from "./modules/catalogs.js";
import { getDashboard } from "./modules/dashboard.js";
import { archiveCase, createCase, createNote, createResource, getCase, listCases, updateCase } from "./modules/cases.js";
import { createEvent, deleteEvent, listEvents, updateEvent } from "./modules/events.js";
import { startSisfeScheduler } from "./modules/sisfe/scheduler.js";
import { asyncHandler, HttpError } from "./utils/http.js";

const app = express();

app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.frontendUrls.includes(origin.replace(/\/$/, ""))) return callback(null, true);
      callback(new Error("Origen no permitido por CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "shippear-juridico" }));
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

app.use((_request, response) => response.status(404).json({ error: "Ruta no encontrada" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return void response.status(400).json({ error: "Datos invalidos", issues: error.issues });
  if (error instanceof HttpError) return void response.status(error.status).json({ error: error.message });
  console.error(error);
  response.status(500).json({ error: "Error interno" });
});

startSisfeScheduler();

app.listen(config.port, () => console.log(`API disponible en http://localhost:${config.port}`));
