import type { Request, Response } from "express";
import { Jurisdiction } from "../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types/auth.js";

export const getCatalogs = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
  const jurisdiction = Object.values(Jurisdiction).includes(request.query.jurisdiction as Jurisdiction)
    ? (request.query.jurisdiction as Jurisdiction)
    : undefined;

  const [stages, facilities, offenses] = await Promise.all([
    prisma.proceduralStage.findMany({
      where: { active: true, ...(jurisdiction ? { jurisdiction: { in: [jurisdiction, Jurisdiction.OTHER] } } : {}) },
      orderBy: [{ jurisdiction: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.detentionFacility.findMany({ where: { workspaceId }, orderBy: [{ system: "asc" }, { name: "asc" }] }),
    prisma.offense.findMany({
      where: query
        ? { active: true, OR: [{ name: { contains: query, mode: "insensitive" } }, { legalReference: { contains: query, mode: "insensitive" } }] }
        : { active: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      take: query ? 60 : 40,
    }),
  ]);

  response.json({ stages, facilities, offenses });
};
