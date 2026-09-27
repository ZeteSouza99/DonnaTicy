const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte uma data sem hora ("YYYY-MM-DD", vinda de <input type="date">) em um
 * Date fixado ao meio-dia UTC. Isso impede que o fuso horário local (UTC-3 no
 * Brasil) desloque o dia para trás ao exibir o valor.
 * Strings com hora e objetos Date são preservados como estão.
 */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return value;
  const raw = value.trim();
  return DATE_ONLY_PATTERN.test(raw) ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
}

/** Início do dia em UTC — use no limite inferior (`gte`) de filtros por período. */
export function startOfDayUtc(value: string | Date): Date {
  if (value instanceof Date) return value;
  const raw = value.trim();
  return DATE_ONLY_PATTERN.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
}

/** Fim do dia em UTC — use no limite superior (`lte`) de filtros por período. */
export function endOfDayUtc(value: string | Date): Date {
  if (value instanceof Date) return value;
  const raw = value.trim();
  return DATE_ONLY_PATTERN.test(raw) ? new Date(`${raw}T23:59:59.999Z`) : new Date(raw);
}

/** Converte um Date/ISO para "YYYY-MM-DD" lendo em UTC (preenche <input type="date">). */
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" a partir de um Date lido no relógio local (para datas calculadas no cliente). */
export function toLocalDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "YYYY-MM-DD" do dia de hoje segundo o relógio local (não o UTC). */
export function todayInputValue(): string {
  return toLocalDateInputValue(new Date());
}
