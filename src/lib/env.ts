import { z } from "./zod";

const DURATION_PATTERN = /^\d+[smhd]?$/;

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "defina a URL de conexão do PostgreSQL."),
  JWT_SECRET: z.string().min(32, "use no mínimo 32 caracteres."),
  JWT_EXPIRES_IN: z
    .string()
    .regex(DURATION_PATTERN, "use segundos ou o formato 30m, 8h, 1d.")
    .default("8h"),
  CRON_SECRET: z.string().min(16, "use no mínimo 16 caracteres.").optional(),
  MFA_ENCRYPTION_KEY: z.string().min(32, "use no mínimo 32 caracteres.").optional(),
  PENDING_ORDER_TTL_HOURS: z.coerce.number().int().positive().default(48),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Valida um conjunto de variáveis sem cache (usado nos testes e no boot). */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const normalized = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
  const parsed = serverEnvSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Variáveis de ambiente inválidas — ${issues.join("; ")}`);
  }
  return parsed.data;
}

let cached: ServerEnv | undefined;

/** Configuração do servidor validada uma única vez por processo. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** Converte "30m", "8h", "1d" ou segundos puros em segundos. */
export function durationToSeconds(value: string): number {
  if (!DURATION_PATTERN.test(value)) throw new Error(`Duração inválida: ${value}`);
  const unit = value.at(-1) as string;
  return unit in UNIT_SECONDS ? Number(value.slice(0, -1)) * UNIT_SECONDS[unit] : Number(value);
}
