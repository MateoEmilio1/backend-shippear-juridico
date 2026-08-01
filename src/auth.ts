import { createHash, randomInt } from "node:crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { WorkspaceRole } from "./generated/prisma/client.js";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import type { AuthenticatedRequest, SessionPayload } from "./types/auth.js";
import { HttpError } from "./utils/http.js";

const requestOtpSchema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) });
const verifyOtpSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  otp: z.string().regex(/^\d{6}$/),
});

const hashOtp = (otp: string) => createHash("sha256").update(otp).digest("hex");
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.nodeEnv === "production",
  sameSite: config.nodeEnv === "production" ? "none" : "lax",
  maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  path: "/",
});

const ensureMembership = async (userId: string) => {
  const existing = await prisma.membership.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const workspace = await prisma.workspace.upsert({
    where: { slug: "antenucci-penal" },
    update: {},
    create: { name: "Antenucci Penal", slug: "antenucci-penal" },
  });
  const membershipCount = await prisma.membership.count({ where: { workspaceId: workspace.id } });
  return prisma.membership.create({
    data: {
      userId,
      workspaceId: workspace.id,
      role: membershipCount === 0 ? WorkspaceRole.OWNER : WorkspaceRole.LAWYER,
    },
    include: { workspace: true },
  });
};

export const requestOtp = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { email } = requestOtpSchema.parse(request.body);
    if (!config.allowAnyEmail && !config.allowedEmails.includes(email)) {
      throw new HttpError(403, "Este email no esta autorizado");
    }

    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email } });
    if (!user.isActive) throw new HttpError(403, "Usuario inactivo");

    const otp = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + config.otpExpirationMinutes * 60_000);
    await prisma.$transaction([
      prisma.otp.deleteMany({ where: { userId: user.id } }),
      prisma.otp.create({ data: { userId: user.id, codeHash: hashOtp(otp), expiresAt } }),
    ]);

    response.status(201).json({ message: "Codigo generado", otp, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { email, otp } = verifyOtpSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) throw new HttpError(400, "Codigo invalido o vencido");

    const record = await prisma.otp.findFirst({
      where: { userId: user.id, codeHash: hashOtp(otp), expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!record) throw new HttpError(400, "Codigo invalido o vencido");

    const membership = await ensureMembership(user.id);
    await prisma.otp.deleteMany({ where: { userId: user.id } });
    const payload: SessionPayload = {
      userId: user.id,
      email: user.email,
      workspaceId: membership.workspaceId,
      role: membership.role,
    };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });

    response.cookie("session", token, cookieOptions()).json({
      user: { id: user.id, email: user.email, fullName: user.fullName },
      workspace: membership.workspace,
      role: membership.role,
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (request: Request, response: Response) => {
  const { userId, workspaceId, role } = (request as AuthenticatedRequest).auth;
  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, fullName: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
  ]);
  if (!user || !workspace) throw new HttpError(401, "Sesion invalida");
  response.json({ user, workspace, role });
};

export const logout = (_request: Request, response: Response) => {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  response.clearCookie("session", options).json({ message: "Sesion cerrada" });
};
