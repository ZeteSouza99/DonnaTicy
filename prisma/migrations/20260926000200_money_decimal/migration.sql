-- Valores monetários passam de double precision para numeric: centavos exatos em
-- somas, incrementos e comparações. A conversão arredonda para a escala da coluna
-- (2 casas; 4 no custo unitário de matéria-prima/compra e no valor unitário da NF).
-- Reescreve as tabelas afetadas: aplique fora do horário de pico.

-- AlterTable
ALTER TABLE "cart_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "coupons" ALTER COLUMN "discount_value" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "min_order_value" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "lifetime_value" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "avg_ticket" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "discount_approvals" ALTER COLUMN "cart_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discount_value" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discount_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "final_total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "exchanges" ALTER COLUMN "amount_returned" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "amount_new" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "difference" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "financial_entries" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "invoice_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "total_price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "real_cost" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "cost_margin" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "commercial_value" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "icms_base" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "icms_value" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "ipi_value" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "freight" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "products_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discount_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "icms_base_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "icms_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "ipi_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "invoice_total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total_price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "cost_price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discount_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "shipping_cost" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "used_store_credit_amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "payment_links" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "payment_transactions" ALTER COLUMN "gross_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "admin_fee_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "net_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "anticipation_fee_amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "additional_cost" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "production_orders" ALTER COLUMN "unit_cost_cmt" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "cost_price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "base_price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "purchase_order_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "total_price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "purchase_orders" ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "raw_materials" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(12,4);

-- AlterTable
ALTER TABLE "return_requests" ALTER COLUMN "refund_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "store_credit_amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "shipments" ALTER COLUMN "shipping_cost" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "store_credits" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "remaining_amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "suppliers" ALTER COLUMN "min_order_value" SET DATA TYPE DECIMAL(12,2);
