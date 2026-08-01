const SISFE_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;

export const parseSisfeDate = (value: string): Date => {
  const match = value.match(SISFE_DATE_PATTERN);
  if (!match) throw new Error(`Formato de fecha SISFE invalido: "${value}"`);

  const [, day, month, year, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
};
