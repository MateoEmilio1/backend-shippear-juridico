import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import { config } from "./config.js";
import { logout, me, requestOtp, verifyOtp } from "./auth.js";

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
app.get("/api/auth/me", me);
app.post("/api/auth/logout", logout);

app.use((_request, response) => response.status(404).json({ error: "Ruta no encontrada" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return void response.status(400).json({ error: "Datos invalidos", issues: error.issues });
  console.error(error);
  response.status(500).json({ error: "Error interno" });
});

app.listen(config.port, () => console.log(`API disponible en http://localhost:${config.port}`));
