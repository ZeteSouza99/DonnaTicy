/** Valida o ambiente uma vez na subida do servidor: configuração inválida falha antes da primeira requisição. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { serverEnv } = await import("./lib/env");
  serverEnv();
}
