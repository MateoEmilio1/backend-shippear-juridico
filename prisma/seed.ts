import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { Jurisdiction, PrismaClient } from "../src/generated/prisma/client.js";

type OffenseCatalog = Array<{ cat: string; items: Array<{ n: string; a: string }> }>;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL no esta definido");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const stages = [
  [Jurisdiction.SANTA_FE, "CPPSF", "IPP — Investigación Penal Preparatoria", "INVESTIGATION", 10, false],
  [Jurisdiction.SANTA_FE, "CPPSF", "Etapa Intermedia (SF)", "INTERMEDIATE", 20, false],
  [Jurisdiction.SANTA_FE, "CPPSF", "Juicio Oral (SF)", "TRIAL", 30, false],
  [Jurisdiction.SANTA_FE, "CPPSF", "Ejecución Penal (SF)", "ENFORCEMENT", 40, false],
  [Jurisdiction.FEDERAL, "CPPF", "Investigación Preliminar", "INVESTIGATION", 10, false],
  [Jurisdiction.FEDERAL, "CPPF", "Formalización de la Investigación", "INVESTIGATION", 20, false],
  [Jurisdiction.FEDERAL, "CPPF", "Etapa Intermedia — Control de Acusación", "INTERMEDIATE", 30, false],
  [Jurisdiction.FEDERAL, "CPPF", "Juicio Oral Federal", "TRIAL", 40, false],
  [Jurisdiction.FEDERAL, "CPPF", "Determinación de Pena", "SENTENCING", 50, false],
  [Jurisdiction.FEDERAL, "CPPF", "Ejecución Penal Federal", "ENFORCEMENT", 60, false],
  [Jurisdiction.OTHER, "OTHER", "Suspensión del Proceso a Prueba", "ALTERNATIVE", 70, false],
  [Jurisdiction.OTHER, "OTHER", "Conciliación / Reparación Integral", "ALTERNATIVE", 71, false],
  [Jurisdiction.OTHER, "OTHER", "Acuerdo Pleno", "ALTERNATIVE", 72, false],
  [Jurisdiction.OTHER, "OTHER", "Juicio Abreviado", "ALTERNATIVE", 73, false],
  [Jurisdiction.OTHER, "OTHER", "Sobreseído", "RESOLUTION", 90, true],
  [Jurisdiction.OTHER, "OTHER", "Archivado", "RESOLUTION", 91, true],
  [Jurisdiction.OTHER, "OTHER", "Suspendido", "RESOLUTION", 92, false],
  [Jurisdiction.OTHER, "OTHER", "Condena Firme", "RESOLUTION", 93, true],
  [Jurisdiction.OTHER, "OTHER", "Absolución", "RESOLUTION", 94, true],
] as const;

const federalFacilities = [
  "CPF I — Ezeiza", "CPF II — Marcos Paz", "CPF III — Gral. Güemes (Salta)",
  "CPF IV — Ezeiza (femenino)", "CPF V — Senillosa (Neuquén)",
  "CPF VI — Luján de Cuyo (Mendoza)", "CPF VII — Ezeiza (mixto)",
  "CPF CABA — Devoto", "CPF Jóvenes Adultos — Marcos Paz", "U4 SPF — Santa Rosa (La Pampa)",
  "U5 SPF — Gral. Roca (Río Negro)", "U6 SPF — Rawson (Chubut)",
  "U7 SPF — Resistencia (Chaco)", "U8 SPF — Jujuy", "U10 SPF — Formosa",
  "U11 SPF — Roque Sáenz Peña (Chaco)", "U12 SPF — Viedma (Río Negro)",
  "U13 SPF — Santa Rosa (La Pampa)", "U14 SPF — Esquel (Chubut)",
  "U15 SPF — Río Gallegos (Santa Cruz)", "U16 SPF — Cerrillos (Salta)",
  "U17 SPF — Candelaria (Misiones)", "U19 SPF — Ezeiza", "U21 SPF — CABA",
  "U22 SPF — Jujuy", "U25 SPF — Gral. Pico (La Pampa)",
  "U30 SPF — Santa Rosa (La Pampa)", "U34 SPF — Campo de Mayo",
  "U35 SPF — San Martín (Santiago del Estero)", "U36 SPF — Cárcel Federal Coronda",
];

const santaFeFacilities = [
  "UP N°1 — Instituto Correccional Modelo (Coronda)", "UP N°2 — Alcaidía Regional (Las Flores)",
  "UP N°3 — Instituto de Detención (Rosario)", "UP N°4 — Mujeres Santa Fe",
  "UP N°5 — Mujeres Rosario", "UP N°6 — Rosario", "UP N°7 — Escuela Penitenciaria (Santa Fe)",
  "UP N°8 — Santa Fe", "UP N°9 — Colonia Penal de Recreo", "UP N°10 — Santa Felicia (Vera)",
  "UP N°11 — Complejo Penitenciario Piñero", "UP N°12 — Complejo Penitenciario Rosario",
];

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "antenucci-penal" },
    update: {},
    create: { name: "Antenucci Penal", slug: "antenucci-penal" },
  });

  await prisma.proceduralStage.createMany({
    data: stages.map(([jurisdiction, procedureCode, name, category, sortOrder, isFinal]) => ({
      jurisdiction, procedureCode, name, category, sortOrder, isFinal,
    })),
    skipDuplicates: true,
  });

  await prisma.detentionFacility.createMany({
    data: [
      ...federalFacilities.map((name) => ({ workspaceId: workspace.id, name, system: "SPF" })),
      ...santaFeFacilities.map((name) => ({ workspaceId: workspace.id, name, system: "SANTA_FE", province: "Santa Fe" })),
      { workspaceId: workspace.id, name: "Domicilio", system: "HOUSE_ARREST" },
      { workspaceId: workspace.id, name: "Otra", system: "OTHER" },
    ],
    skipDuplicates: true,
  });

  const catalog = JSON.parse(
    await readFile(new URL("./data/offenses.json", import.meta.url), "utf8"),
  ) as OffenseCatalog;

  for (const [sortOrder, group] of catalog.entries()) {
    const category = await prisma.offenseCategory.upsert({
      where: { name: group.cat },
      update: { sortOrder },
      create: { name: group.cat, sortOrder },
    });
    await prisma.offense.createMany({
      data: group.items.map((item) => ({
        categoryId: category.id,
        name: item.n,
        legalReference: item.a,
        lawNumber: item.a.match(/Ley N°?\s*(\d+)/i)?.[1] ?? null,
        article: item.a.match(/Art\.\s*([^PInc]+)/i)?.[1]?.trim() ?? null,
      })),
      skipDuplicates: true,
    });
  }

  console.log(`Seed listo: ${catalog.length} categorias y ${catalog.reduce((sum, group) => sum + group.items.length, 0)} figuras penales.`);
}

main().finally(() => prisma.$disconnect());
