import { describe, expect, it } from "vitest";
import { actionForMethod, can, canAccessPath, resourceForApiPath } from "@/lib/permissions";

describe("can", () => {
  it("manage implica write, que implica read", () => {
    expect(can("STORE_MANAGER", "catalog", "manage")).toBe(true);
    expect(can("STORE_MANAGER", "catalog", "write")).toBe(true);
    expect(can("STORE_MANAGER", "catalog", "read")).toBe(true);
  });

  it("write não concede manage", () => {
    expect(can("ECOM_ADMIN", "catalog", "write")).toBe(true);
    expect(can("ECOM_ADMIN", "catalog", "manage")).toBe(false);
    expect(can("SELLER", "orders", "write")).toBe(true);
    expect(can("SELLER", "orders", "manage")).toBe(false);
  });

  it("mantém compras restritas ao SUPER_ADMIN", () => {
    expect(can("SUPER_ADMIN", "purchasing", "manage")).toBe(true);
    for (const role of ["STORE_MANAGER", "BUYER", "SELLER", "VIEWER"]) {
      expect(can(role, "purchasing", "read")).toBe(false);
    }
  });

  it("aprovação de desconto só para admin e gerente", () => {
    expect(can("SUPER_ADMIN", "orders", "manage")).toBe(true);
    expect(can("STORE_MANAGER", "orders", "manage")).toBe(true);
    expect(can("ECOM_ADMIN", "orders", "manage")).toBe(false);
  });

  it("inspeção de devolução inclui o operador de depósito", () => {
    expect(can("WAREHOUSE_OP", "logistics", "manage")).toBe(true);
    expect(can("ECOM_ADMIN", "logistics", "manage")).toBe(false);
  });

  it("VIEWER só lê e nunca vê usuários", () => {
    expect(can("VIEWER", "financial", "read")).toBe(true);
    expect(can("VIEWER", "financial", "write")).toBe(false);
    expect(can("VIEWER", "users", "read")).toBe(false);
  });

  it("recusa papéis desconhecidos", () => {
    expect(can("HACKER", "catalog", "read")).toBe(false);
    expect(can("", "dashboard", "read")).toBe(false);
  });
});

describe("canAccessPath", () => {
  it("aplica leitura/escrita conforme o método HTTP", () => {
    expect(actionForMethod("GET")).toBe("read");
    expect(actionForMethod("DELETE")).toBe("write");
    expect(canAccessPath("SELLER", "/api/catalog/products", "GET")).toBe(true);
    expect(canAccessPath("SELLER", "/api/catalog/products", "POST")).toBe(false);
  });

  it("bloqueia páginas e APIs de compras para quem não é SUPER_ADMIN", () => {
    expect(canAccessPath("STORE_MANAGER", "/dashboard/compras", "GET")).toBe(false);
    expect(canAccessPath("STORE_MANAGER", "/api/purchasing/orders", "GET")).toBe(false);
    expect(canAccessPath("SUPER_ADMIN", "/api/purchasing/orders", "POST")).toBe(true);
  });

  it("mapeia /api/sales para o recurso de pedidos", () => {
    expect(resourceForApiPath("/api/sales/coupons")).toBe("orders");
    expect(canAccessPath("SELLER", "/api/sales/discount-requests", "POST")).toBe(true);
  });

  it("libera caminhos não mapeados (a rota ainda exige permissão no handler)", () => {
    expect(canAccessPath("SELLER", "/api/auth/me", "GET")).toBe(true);
    expect(canAccessPath("SELLER", "/dashboard", "GET")).toBe(true);
  });
});
