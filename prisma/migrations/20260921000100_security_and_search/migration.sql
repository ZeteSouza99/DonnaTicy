-- Reconcilia instalações novas e bancos que receberam apply-schema-updates.ts.
-- A baseline 0_init permanece intacta. Não reinicializa token_version existente.
BEGIN;

ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "reset_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "public"."rate_limits"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "rate_limits_reset_at_idx"
  ON "public"."rate_limits" ("reset_at");

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- No Supabase a extensão pode estar em "extensions", fora do search_path.
-- Usa o namespace existente, sem mover nem recriar a extensão.
DO $$
DECLARE
  extension_schema TEXT;
BEGIN
  SELECT n.nspname INTO STRICT extension_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  EXECUTE format('CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON public.products USING GIN (name %I.gin_trgm_ops)', extension_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS products_code_trgm_idx ON public.products USING GIN (code %I.gin_trgm_ops)', extension_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS product_variants_sku_trgm_idx ON public.product_variants USING GIN (sku %I.gin_trgm_ops)', extension_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS customers_full_name_trgm_idx ON public.customers USING GIN (full_name %I.gin_trgm_ops)', extension_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON public.customers USING GIN (phone %I.gin_trgm_ops)', extension_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS orders_code_trgm_idx ON public.orders USING GIN (code %I.gin_trgm_ops)', extension_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS suppliers_company_name_trgm_idx ON public.suppliers USING GIN (company_name %I.gin_trgm_ops)', extension_schema);
END $$;

COMMIT;