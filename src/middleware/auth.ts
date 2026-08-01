import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest, SessionPayload } from "../types/auth.js";

export const requireAuth = async (request: Request, response: Response, next: NextFunction) => {
  const token = request.cookies.session;
  if (!token) return void response.status(401).json({ error: "No autenticado" });

  try {
    const payload = jwt.verify(token, config.jwtSecret) as SessionPayload;
    const membership = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: payload.workspaceId, userId: payload.userId } },
      include: { user: true },
    });
    if (!membership?.user.isActive) return void response.status(401).json({ error: "Sesion invalida" });
    (request as AuthenticatedRequest).auth = { ...payload, role: membership.role };
    next();
  } catch {
    response.status(401).json({ error: "Sesion invalida o vencida" });
  }
};
