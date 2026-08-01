import { createHash, randomInt } from "node:crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config.js";
import { prisma } from "./prisma.js";

const requestOtpSchema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) });
const verifyOtpSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  otp: z.string().regex(/^\d{6}$/),
});

type SessionPayload = { userId: string; email: string };

const hashOtp = (otp: string) => createHash("sha256").update(otp).digest("hex");
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.nodeEnv === "production",
  sameSite: config.nodeEnv === "production" ? "none" : "lax",
  maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  path: "/",
});

const sessionUser = (request: Request): SessionPayload | null => {
  const token = request.cookies.session;
  if (!token) return null;

  try {
    return jwt.verify(token, config.jwtSecret) as SessionPayload;
  } catch {
    return null;
  }
};

export const requestOtp = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { email } = requestOtpSchema.parse(request.body);
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email } });
    const otp = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + config.otpExpirationMinutes * 60_000);

    await prisma.$transaction([
      prisma.otp.deleteMany({ where: { userId: user.id } }),
      prisma.otp.create({ data: { userId: user.id, codeHash: hashOtp(otp), expiresAt } }),
    ]);

    response.status(201).json({
      message: "Codigo generado",
      otp,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { email, otp } = verifyOtpSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return void response.status(400).json({ error: "Codigo invalido o vencido" });

    const record = await prisma.otp.findFirst({
      where: { userId: user.id, codeHash: hashOtp(otp), expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!record) return void response.status(400).json({ error: "Codigo invalido o vencido" });

    await prisma.otp.deleteMany({ where: { userId: user.id } });
    const token = jwt.sign({ userId: user.id, email: user.email } satisfies SessionPayload, config.jwtSecret, {
      expiresIn: `${config.sessionDays}d`,
    });

    response.cookie("session", token, cookieOptions()).json({ user });
  } catch (error) {
    next(error);
  }
};

export const me = async (request: Request, response: Response) => {
  const session = sessionUser(request);
  if (!session) return void response.status(401).json({ error: "No autenticado" });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return void response.status(401).json({ error: "Sesion invalida" });
  response.json({ user });
};

export const logout = (_request: Request, response: Response) => {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  response.clearCookie("session", options).json({ message: "Sesion cerrada" });
};
