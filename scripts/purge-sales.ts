/**
 * Remove TODAS as vendas de teste e o movimento gerado por elas,
 * devolvendo o estoque ao estado anterior às vendas.
 *
 * APAGA: pedidos, itens, pagamentos, lançamentos financeiros vinculados a
 * pedidos, envios, devoluções, trocas, vales-troca originados de pedidos,
 * pontos de fidelidade de pedidos, reservas de estoque, movimentos de estoque
 * com referência a pedidos, solicitações de desconto e carrinhos.
 *
 * PRESERVA: produtos, variantes, CORES, tamanhos, categorias, coleções,
 * linhas, clientes, fornecedores, usuários, locais, notas de entrada, compras,
 * produção e lançamentos financeiros manuais (sem vínculo com pedido).
 *
 * Uso:
 *   npx tsx scripts/purge-sales.ts          -> apenas relatório (dry-run)
 *   npx tsx scripts/purge-sales.ts --yes    -> executa a limpeza
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CONFIRM = process.argv.includes("--yes");

/** Contagens exibidas no relatório. */
const REPORT: { label: string; sql: string }[] = [
  { label: "orders", sql: `SELECT COUNT(*)::bigint AS count FROM orders` },
  { label: "order_items", sql: `SELECT COUNT(*)::bigint AS count FROM order_items` },
  { label: "payment_transactions", sql: `SELECT COUNT(*)::bigint AS count FROM payment_transactions` },
  { label: "financial_entries (venda)", sql: `SELECT COUNT(*)::bigint AS count FROM financial_entries WHERE order_id IS NOT NULL` },
  { label: "shipments", sql: `SELECT COUNT(*)::bigint AS count FROM shipments` },
  { label: "return_requests", sql: `SELECT COUNT(*)::bigint AS count FROM return_requests` },
  { label: "exchanges", sql: `SELECT COUNT(*)::bigint AS count FROM exchanges` },
  { label: "store_credits (de venda)", sql: `SELECT COUNT(*)::bigint AS count FROM store_credits WHERE origin_order_id IS NOT NULL` },
  { label: "loyalty_transactions (venda)", sql: `SELECT COUNT(*)::bigint AS count FROM loyalty_transactions WHERE order_id IS NOT NULL` },
  { label: "stock_reservations", sql: `SELECT COUNT(*)::bigint AS count FROM stock_reservations` },
  { label: "stock_movements (venda)", sql: `SELECT COUNT(*)::bigint AS count FROM stock_movements WHERE reference_type = 'Order'` },
  { label: "discount_approvals", sql: `SELECT COUNT(*)::bigint AS count FROM discount_approvals` },
  { label: "carts", sql: `SELECT COUNT(*)::bigint AS count FROM carts` },
];

/**
 * Passos executados na transação. Ordem importa:
 * estoque é restaurado ANTES de apagar os movimentos que o descrevem.
 */
const STEPS: { label: string; sql: string }[] = [
  {
    label: "Devolve ao estoque as saídas de venda",
    sql: `
      UPDATE stock_positions sp
      SET quantity = sp.quantity + agg.qty
      FROM (
        SELECT variant_id, from_location_id AS location_id, SUM(quantity)::int AS qty
        FROM stock_movements
        WHERE reference_type = 'Order' AND from_location_id IS NOT NULL
        GROUP BY variant_id, from_location_id
      ) agg
      WHERE sp.variant_id = agg.variant_id AND sp.location_id = agg.location_id
    `,
  },
  {
    label: "Estorna as entradas geradas por cancelamento/devolução",
    sql: `
      UPDATE stock_positions sp
      SET quantity = GREATEST(sp.quantity - agg.qty, 0)
      FROM (
        SELECT variant_id, to_location_id AS location_id, SUM(quantity)::int AS qty
        FROM stock_movements
        WHERE reference_type = 'Order' AND to_location_id IS NOT NULL
        GROUP BY variant_id, to_location_id
      ) agg
      WHERE sp.variant_id = agg.variant_id AND sp.location_id = agg.location_id
    `,
  },
  {
    label: "Zera as quantidades reservadas",
    sql: `UPDATE stock_positions SET reserved_qty = 0 WHERE reserved_qty <> 0`,
  },
  {
    label: "Remove trocas e seus vales-troca",
    sql: `
      WITH removed AS (
        DELETE FROM exchanges RETURNING store_credit_id
      )
      DELETE FROM store_credits sc
      WHERE sc.origin_order_id IS NOT NULL
         OR sc.id IN (SELECT store_credit_id FROM removed WHERE store_credit_id IS NOT NULL)
    `,
  },
  { label: "Remove itens de devolução", sql: `DELETE FROM return_request_items` },
  { label: "Remove devoluções", sql: `DELETE FROM return_requests` },
  { label: "Remove envios", sql: `DELETE FROM shipments` },
  { label: "Remove transações de pagamento", sql: `DELETE FROM payment_transactions` },
  { label: "Remove lançamentos financeiros de venda", sql: `DELETE FROM financial_entries WHERE order_id IS NOT NULL` },
  { label: "Remove pontos de fidelidade de venda", sql: `DELETE FROM loyalty_transactions WHERE order_id IS NOT NULL` },
  { label: "Remove solicitações de desconto", sql: `DELETE FROM discount_approvals` },
  { label: "Remove itens de pedido", sql: `DELETE FROM order_items` },
  { label: "Remove reservas de estoque", sql: `DELETE FROM stock_reservations` },
  { label: "Remove movimentos de estoque de venda", sql: `DELETE FROM stock_movements WHERE reference_type = 'Order'` },
  { label: "Remove itens de carrinho", sql: `DELETE FROM cart_items` },
  { label: "Remove carrinhos", sql: `DELETE FROM carts` },
  { label: "Remove pedidos", sql: `DELETE FROM orders` },
  {
    label: "Zera indicadores de compra dos clientes",
    sql: `
      UPDATE customers
      SET lifetime_value = 0,
          total_orders = 0,
          avg_ticket = 0,
          loyalty_points = 0,
          last_purchase_at = NULL,
          first_purchase_at = NULL
      WHERE total_orders <> 0
         OR lifetime_value <> 0
         OR loyalty_points <> 0
         OR last_purchase_at IS NOT NULL
         OR first_purchase_at IS NOT NULL
    `,
  },
  { label: "Zera o uso dos cupons", sql: `UPDATE coupons SET used_count = 0 WHERE used_count <> 0` },
];

async function count(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  console.log("\n🧾 Registros de venda encontrados:");
  let total = 0;
  for (const item of REPORT) {
    const value = await count(item.sql);
    total += value;
    console.log(`   ${item.label.padEnd(30)} ${value}`);
  }
  console.log(`   ${"TOTAL".padEnd(30)} ${total}`);

  if (total === 0) {
    console.log("\n✅ Nada a remover.\n");
    return;
  }

  if (!CONFIRM) {
    console.log("\n⚠️  DRY-RUN. Nada foi alterado. Rode com --yes para executar.");
    console.log("   Cores, tamanhos, categorias, produtos e clientes são preservados.\n");
    return;
  }

  console.log("\n🗑️  Executando limpeza...");
  await prisma.$transaction(
    async (tx) => {
      for (const step of STEPS) {
        const affected = await tx.$executeRawUnsafe(step.sql);
        console.log(`   ${step.label.padEnd(46)} ${affected} linha(s)`);
      }
    },
    { timeout: 120_000 },
  );

  console.log("\n✅ Vendas de teste removidas e estoque restaurado.\n");
}

main()
  .catch((error) => {
    console.error("❌ Falha:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
