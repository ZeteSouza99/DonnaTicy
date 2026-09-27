-- Estados de registro interno: reembolso pendente não confirma estorno bancário.
ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'REFUND_PENDING' BEFORE 'REFUNDED';
ALTER TYPE "public"."financial_entry_status" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Rastreia o débito do vale em pedidos futuros. Não presume consumo histórico.
ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "used_store_credit_id" TEXT,
  ADD COLUMN IF NOT EXISTS "used_store_credit_amount" DOUBLE PRECISION;

ALTER TABLE "public"."financial_entries"
  ADD COLUMN IF NOT EXISTS "cancellation_order_id" TEXT;

CREATE INDEX IF NOT EXISTS "orders_used_store_credit_id_idx"
  ON "public"."orders" ("used_store_credit_id");
CREATE UNIQUE INDEX IF NOT EXISTS "financial_entries_cancellation_order_id_key"
  ON "public"."financial_entries" ("cancellation_order_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_used_store_credit_id_fkey' AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_used_store_credit_id_fkey"
      FOREIGN KEY ("used_store_credit_id") REFERENCES "public"."store_credits"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_entries_cancellation_order_id_fkey' AND conrelid = 'public.financial_entries'::regclass
  ) THEN
    ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_cancellation_order_id_fkey"
      FOREIGN KEY ("cancellation_order_id") REFERENCES "public"."orders"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;