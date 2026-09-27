import { ValidationError } from "./errors";
import { startOfDayUtc, endOfDayUtc } from "./date";

export function parseEnumParam<T extends Record<string, string>>(
  value: string | null,
  enumObj: T,
  label: string,
): T[keyof T] | undefined {
  if (!value) return undefined;
  if (!Object.values(enumObj).includes(value)) {
    throw new ValidationError(`Valor inválido para ${label}: ${value}.`);
  }
  return value as T[keyof T];
}

export function parseDateParam(
  value: string | null,
  label: string,
  boundary: "start" | "end" = "start",
): Date | undefined {
  if (!value) return undefined;
  const date = boundary === "end" ? endOfDayUtc(value) : startOfDayUtc(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Data inválida para ${label}: ${value}.`);
  }
  return date;
}
