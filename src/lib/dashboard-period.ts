/** Datas civis no fuso da loja; o filtro mensal mantém o período padrão da API. */
export function dashboardPeriod(preset: "today" | "week" | "month", now: Date, timeZone: string) {
  if (preset === "month") return { from: "", to: "" };
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const to = part("year") + "-" + part("month") + "-" + part("day");
  const first = new Date(to + "T12:00:00Z");
  if (preset === "week") first.setUTCDate(first.getUTCDate() - 6);
  return { from: first.toISOString().slice(0, 10), to };
}
