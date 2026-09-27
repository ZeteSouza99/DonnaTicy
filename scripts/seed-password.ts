import { strongPasswordSchema } from "../src/schemas/auth";

/**
 * Senha de usuário criado por script, lida do ambiente. Sem padrão fraco:
 * falta ou senha fraca aborta o script antes de gravar qualquer coisa.
 */
export function seedPassword(envName: string, fallbackEnvName?: string): string {
  const value = process.env[envName] || (fallbackEnvName ? process.env[fallbackEnvName] : undefined);
  const parsed = strongPasswordSchema.safeParse(value ?? "");
  if (!parsed.success) {
    const source = fallbackEnvName ? `${envName} (ou ${fallbackEnvName})` : envName;
    throw new Error(`${source}: defina uma senha com 8+ caracteres, maiúscula, minúscula e número.`);
  }
  return parsed.data;
}
