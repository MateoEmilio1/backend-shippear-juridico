import type { Request } from "express";
import type { WorkspaceRole } from "../generated/prisma/client.js";

export type SessionPayload = {
  userId: string;
  email: string;
  workspaceId: string;
  role: WorkspaceRole;
};

export type AuthenticatedRequest = Request & { auth: SessionPayload };
