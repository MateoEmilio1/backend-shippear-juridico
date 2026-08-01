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
};
