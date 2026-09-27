-- Ações automáticas do sistema (cron) são auditadas sem usuário.
ALTER TABLE "public"."audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;

-- Senha provisória obrigatória e anti-replay do código TOTP.
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "mfa_last_step" INTEGER,
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- Sessões encerradas no logout antes de expirar.
CREATE TABLE IF NOT EXISTS "public"."revoked_tokens" (
    "jti" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX IF NOT EXISTS "revoked_tokens_expires_at_idx" ON "public"."revoked_tokens"("expires_at");

-- O login passa a normalizar o e-mail; falha (sem alterar nada) se houver duplicados só por caixa.
UPDATE "public"."users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
