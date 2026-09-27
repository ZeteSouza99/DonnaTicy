/** Valida o ambiente uma vez na subida do servidor: configuração inválida falha antes da primeira requisição. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { serverEnv } = await import("./lib/env");
  const env = serverEnv();
  if (env.NODE_ENV === "production" && !env.CRON_SECRET) {
    console.warn(JSON.stringify({
      scope: "boot",
      level: "warn",
      message: "CRON_SECRET não definido: a manutenção diária (pedidos pendentes, vales e sessões expiradas) não vai rodar.",
    }));
  }
}
