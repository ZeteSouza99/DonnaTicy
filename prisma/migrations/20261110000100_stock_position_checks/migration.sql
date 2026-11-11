-- Saldo físico nunca negativo e reserva nunca acima do físico, mesmo com escrita
-- concorrente ou feita fora da aplicação.
-- Falha sem alterar nada se já existir posição inconsistente. Para listar antes de aplicar:
--   SELECT id, variant_id, location_id, quantity, reserved_qty FROM stock_positions
--   WHERE quantity < 0 OR reserved_qty < 0 OR reserved_qty > quantity;
ALTER TABLE "public"."stock_positions"
  ADD CONSTRAINT "stock_positions_quantity_nonnegative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "stock_positions_reserved_within_quantity" CHECK ("reserved_qty" >= 0 AND "reserved_qty" <= "quantity");
