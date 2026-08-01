import { prisma } from "../prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

export const audit = (input: {
  workspaceId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}) => prisma.auditLog.create({ data: input });
