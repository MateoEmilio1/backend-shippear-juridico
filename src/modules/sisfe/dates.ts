const SISFE_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;
const SISFE_DAY_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export const parseSisfeDate = (value: string): Date => {
  const match = value.match(SISFE_DATE_PATTERN);
  if (!match) throw new Error(`Formato de fecha SISFE invalido: "${value}"`);

  const [, day, month, year, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
};

export const parseSisfeDateOrNull = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  const dateTimeMatch = normalized.match(SISFE_DATE_PATTERN);
  if (dateTimeMatch) {
    const [, day, month, year, hour, minute] = dateTimeMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }
  const dayMatch = normalized.match(SISFE_DAY_PATTERN);
  if (dayMatch) {
    const [, day, month, year] = dayMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return null;
};
