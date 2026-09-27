/**
 * Matriz central de autorização (papel × recurso × ação).
 *
 * Fonte única consumida por:
 * - `src/proxy.ts` (bloqueio por prefixo de URL)
 * - `requirePermission` em `src/lib/auth.ts` (todos os handlers de API)
 * - `src/components/layout/sidebar.tsx` (visibilidade do menu)
 *
 * Também roda no navegador (sidebar): não importe Prisma nem nada de Node aqui.
 */

export type Role =
  | "SUPER_ADMIN"
  | "STORE_MANAGER"
  | "SELLER"
  | "BUYER"
  | "WAREHOUSE_OP"
  | "FINANCE"
  | "MARKETING"
  | "ECOM_ADMIN"
  | "VIEWER";

export type Resource =
  | "catalog"
  | "inventory"
  | "orders"
  | "customers"
  | "financial"
  | "purchasing"
  | "logistics"
  | "crm"
  | "users"
  | "imports"
  | "invoices"
  | "reports"
  | "dashboard"
  | "settings";

/** `manage`: editar/excluir cadastros e aprovar operações sensíveis. */
export type Action = "read" | "write" | "manage";

const ALL_RESOURCES: readonly Resource[] = [
  "catalog",
  "inventory",
  "orders",
  "customers",
  "financial",
  "purchasing",
  "logistics",
  "crm",
  "users",
  "imports",
  "invoices",
  "reports",
  "dashboard",
  "settings",
];

interface RolePolicy {
  read: readonly Resource[];
  write: readonly Resource[];
  manage?: readonly Resource[];
}

/**
 * Regra de ouro: `manage` implica `write`, que implica `read` (aplicado em `can`).
 * `purchasing` continua restrito ao ADM/CEO.
 */
const POLICY: Record<Role, RolePolicy> = {
  SUPER_ADMIN: { read: ALL_RESOURCES, write: ALL_RESOURCES, manage: ALL_RESOURCES },
  STORE_MANAGER: {
    manage: ["catalog", "inventory", "orders", "customers", "financial", "logistics"],
    read: [
      "catalog",
      "inventory",
      "orders",
      "customers",
      "financial",
      "logistics",
      "crm",
      "users",
      "imports",
      "invoices",
      "reports",
      "dashboard",
      "settings",
    ],
    write: [
      "catalog",
      "inventory",
      "orders",
      "customers",
      "financial",
      "logistics",
      "crm",
      "imports",
      "invoices",
    ],
  },
  SELLER: {
    read: ["catalog", "inventory", "orders", "customers", "financial", "dashboard", "settings"],
    write: ["orders", "customers", "financial"],
  },
  BUYER: {
    read: ["catalog", "inventory", "invoices", "reports", "dashboard", "settings"],
    write: ["invoices"],
  },
  WAREHOUSE_OP: {
    read: ["catalog", "inventory", "orders", "logistics", "invoices", "dashboard", "settings"],
    write: ["inventory", "logistics", "invoices"],
    manage: ["logistics"],
  },
  FINANCE: {
    read: ["financial", "orders", "customers", "invoices", "reports", "dashboard", "settings"],
    write: ["financial", "invoices"],
  },
  MARKETING: {
    read: ["crm", "customers", "catalog", "reports", "dashboard", "settings"],
    write: ["crm"],
  },
  ECOM_ADMIN: {
    read: [
      "catalog",
      "inventory",
      "orders",
      "customers",
      "crm",
      "logistics",
      "reports",
      "dashboard",
      "settings",
    ],
    write: ["catalog", "orders", "crm", "logistics"],
  },
  VIEWER: {
    read: [
      "catalog",
      "inventory",
      "orders",
      "customers",
      "financial",
      "logistics",
      "crm",
      "invoices",
      "reports",
      "dashboard",
      "settings",
    ],
    write: [],
  },
};

function isRole(value: string): value is Role {
  return value in POLICY;
}

export function can(role: string, resource: Resource, action: Action): boolean {
  if (!isRole(role)) return false;
  const policy = POLICY[role];
  if (policy.manage?.includes(resource)) return true;
  if (action === "manage") return false;
  if (policy.write.includes(resource)) return true;
  return action === "read" && policy.read.includes(resource);
}

/** Métodos HTTP considerados de escrita. */
export function actionForMethod(method: string): Action {
  return method === "GET" || method === "HEAD" || method === "OPTIONS" ? "read" : "write";
}

const API_PREFIX_TO_RESOURCE: ReadonlyArray<readonly [string, Resource]> = [
  ["/api/catalog", "catalog"],
  ["/api/inventory", "inventory"],
  ["/api/orders", "orders"],
  ["/api/sales", "orders"],
  ["/api/customers", "customers"],
  ["/api/financial", "financial"],
  ["/api/purchasing", "purchasing"],
  ["/api/logistics", "logistics"],
  ["/api/crm", "crm"],
  ["/api/users", "users"],
  ["/api/imports", "imports"],
  ["/api/invoices", "invoices"],
  ["/api/reports", "reports"],
  ["/api/dashboard", "dashboard"],
];

const PAGE_PREFIX_TO_RESOURCE: ReadonlyArray<readonly [string, Resource]> = [
  ["/dashboard/catalogo", "catalog"],
  ["/dashboard/estoque", "inventory"],
  ["/dashboard/vendas", "orders"],
  ["/dashboard/clientes", "customers"],
  ["/dashboard/financeiro", "financial"],
  ["/dashboard/compras", "purchasing"],
  ["/dashboard/logistica", "logistics"],
  ["/dashboard/crm", "crm"],
  ["/dashboard/notas-fiscais", "invoices"],
  ["/dashboard/relatorios", "reports"],
  ["/dashboard/configuracoes", "settings"],
];

/** Recurso associado a um caminho de API (`null` quando não mapeado). */
export function resourceForApiPath(pathname: string): Resource | null {
  const match = API_PREFIX_TO_RESOURCE.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : null;
}

/** Recurso associado a uma página do dashboard (`null` para o home `/dashboard`). */
export function resourceForPagePath(pathname: string): Resource | null {
  const match = PAGE_PREFIX_TO_RESOURCE.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : null;
}

/**
 * Decisão de acesso usada pelo middleware. Caminhos não mapeados são liberados
 * (a rota ainda passa por `requireAuth`/`requirePermission` no handler).
 */
export function canAccessPath(role: string, pathname: string, method: string): boolean {
  if (pathname.startsWith("/api/")) {
    const resource = resourceForApiPath(pathname);
    if (!resource) return true;
    return can(role, resource, actionForMethod(method));
  }

  if (pathname.startsWith("/dashboard")) {
    const resource = resourceForPagePath(pathname);
    if (!resource) return true;
    return can(role, resource, "read");
  }

  return true;
}
