import type { Request, Response } from "express";
import { CaseStatus, EventStatus } from "../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types/auth.js";

const urgency = (date: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return { days, level: days < 0 ? "OVERDUE" : days <= 3 ? "URGENT" : days <= 10 ? "UPCOMING" : "NORMAL" };
};

export const getDashboard = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const cases = await prisma.legalCase.findMany({
    where: { workspaceId, status: { not: CaseStatus.ARCHIVED } },
    include: {
      identifiers: { where: { isPrimary: true }, take: 1 },
      events: { where: { status: EventStatus.PENDING }, orderBy: { startsAt: "asc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  const alerts = cases.flatMap((legalCase) => {
    const event = legalCase.events[0];
    if (!event) return [];
    const computed = urgency(event.startsAt);
    return computed.level === "NORMAL" ? [] : [{
      id: event.id,
      caseId: legalCase.id,
      caseTitle: legalCase.title,
      identifier: legalCase.identifiers[0] ?? null,
      title: event.title,
      startsAt: event.startsAt,
      ...computed,
    }];
  }).sort((a, b) => a.days - b.days);

  response.json({
    stats: {
      total: cases.length,
      active: cases.filter((item) => item.status === CaseStatus.ACTIVE).length,
      urgent: alerts.filter((item) => item.level === "OVERDUE" || item.level === "URGENT").length,
      withoutNextEvent: cases.filter((item) => item.events.length === 0).length,
    },
    alerts: alerts.slice(0, 12),
    recentCases: cases.slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      identifier: item.identifiers[0] ?? null,
      updatedAt: item.updatedAt,
    })),
  });
};
