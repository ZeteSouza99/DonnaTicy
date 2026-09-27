/**
 * Impressão de comprovante de venda (não fiscal) — Bematech MP-4200 TH.
 *
 * Estratégia (mesma estrutura do PDV Martcell):
 * 1. Tenta o serviço local de impressão (print-service/) em http://127.0.0.1:5555 → ESC/POS bruto.
 * 2. Se o serviço não estiver disponível, cai para impressão HTML 80mm via window.print().
 *
 * Habilitada por deploy via NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING (ver lib/features.ts).
 */

import { brand } from "./brand";

// ===== Tipos =====

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptPayment {
  label: string;
  amount: number;
  installments?: number;
}

export interface SaleReceiptData {
  code: string;
  createdAt: string;
  sellerName?: string;
  customerName?: string;
  items: ReceiptItem[];
  subtotal: number;
  discountTotal: number;
  total: number;
  payments: ReceiptPayment[];
  change?: number;
}

interface StoreInfo {
  storeName: string;
  storeCnpj?: string;
  storeAddress?: string;
  storePhone?: string;
  receiptFooter?: string;
}

// ===== Configuração =====

// Liberado na CSP (next.config.ts); o serviço escuta só em IPv4 loopback.
const PRINT_SERVICE_URL = "http://127.0.0.1:5555";
const HEALTH_CHECK_TIMEOUT = 1200;
const HEALTH_CACHE_ONLINE_MS = 60_000;
const HEALTH_CACHE_OFFLINE_MS = 15_000;

function storeInfo(): StoreInfo {
  return {
    storeName: brand.name,
    storeCnpj: process.env.NEXT_PUBLIC_STORE_CNPJ || undefined,
    storeAddress: process.env.NEXT_PUBLIC_STORE_ADDRESS || undefined,
    storePhone: process.env.NEXT_PUBLIC_STORE_PHONE || undefined,
    receiptFooter: process.env.NEXT_PUBLIC_RECEIPT_FOOTER || undefined,
  };
}

// ===== Serviço local =====

let serviceHealthCache: { online: boolean; checkedAt: number } | null = null;

async function isPrintServiceOnline(): Promise<boolean> {
  const now = Date.now();
  if (serviceHealthCache) {
    const ttl = serviceHealthCache.online ? HEALTH_CACHE_ONLINE_MS : HEALTH_CACHE_OFFLINE_MS;
    if (now - serviceHealthCache.checkedAt < ttl) return serviceHealthCache.online;
  }
  let online = false;
  try {
    const response = await fetch(`${PRINT_SERVICE_URL}/status`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
    });
    online = response.ok;
  } catch {
    online = false;
  }
  serviceHealthCache = { online, checkedAt: now };
  return online;
}

async function printViaService(data: SaleReceiptData, store: StoreInfo): Promise<boolean> {
  if (!(await isPrintServiceOnline())) return false;
  try {
    const response = await fetch(`${PRINT_SERVICE_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sale_receipt", data, store }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    serviceHealthCache = null;
    return false;
  }
}

// ===== Fallback HTML (80mm via window.print) =====

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatBRL(v: number): string {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function printHtml(html: string): void {
  let printRoot = document.getElementById("print-root");
  if (!printRoot) {
    printRoot = document.createElement("div");
    printRoot.id = "print-root";
    printRoot.style.display = "none";
    document.body.appendChild(printRoot);
  }

  printRoot.innerHTML = html;
  printRoot.style.display = "block";

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      printRoot.style.display = "none";
      printRoot.innerHTML = "";
    }, 500);
  }, 200);
}

function printSaleReceiptHtml(sale: SaleReceiptData, store: StoreInfo): void {
  const headerLines = [
    store.storeCnpj ? `CNPJ: ${store.storeCnpj}` : "",
    store.storeAddress || "",
    store.storePhone ? `Tel: ${store.storePhone}` : "",
  ].filter(Boolean);

  const itemsHtml = sale.items
    .map(
      (item) => `
    <div style="font-size:11px;margin-bottom:2px">
      <div>${escapeHtml(item.name)}</div>
      <div class="item-row">
        <span class="item-qty">${item.quantity}x ${formatBRL(item.unitPrice)}</span>
        <span class="item-price">${formatBRL(item.totalPrice)}</span>
      </div>
    </div>
  `,
    )
    .join("");

  const paymentsHtml = sale.payments
    .map(
      (p) => `
    <div class="info-line">
      <span>${escapeHtml(p.installments && p.installments > 1 ? `${p.label} ${p.installments}x` : p.label)}</span>
      <span>${formatBRL(p.amount)}</span>
    </div>
  `,
    )
    .join("");

  const footerHtml = store.receiptFooter
    ? `<div class="footer" style="margin-top:4px">${store.receiptFooter
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map(escapeHtml)
        .join("<br/>")}</div>`
    : "";

  const html = `
    <div class="print-receipt">
      <div class="store-name">${escapeHtml(store.storeName)}</div>
      ${headerLines.map((line) => `<div class="store-info">${escapeHtml(line)}</div>`).join("")}
      <hr class="divider" />
      <div style="text-align:center;font-weight:bold">COMPROVANTE DE VENDA<br/>SEM VALOR FISCAL</div>
      <hr class="divider" />
      <div class="info-line"><span>Venda ${escapeHtml(sale.code)}</span><span>${formatDateTime(sale.createdAt)}</span></div>
      ${sale.sellerName ? `<div class="info-line"><span>Vendedor:</span><span>${escapeHtml(sale.sellerName)}</span></div>` : ""}
      ${sale.customerName ? `<div class="info-line"><span>Cliente:</span><span>${escapeHtml(sale.customerName)}</span></div>` : ""}
      <hr class="divider" />
      ${itemsHtml}
      <hr class="divider" />
      <div class="info-line"><span>Subtotal</span><span>${formatBRL(sale.subtotal)}</span></div>
      ${sale.discountTotal > 0 ? `<div class="info-line"><span>Desconto</span><span>-${formatBRL(sale.discountTotal)}</span></div>` : ""}
      <div class="info-line" style="font-weight:bold;font-size:14px"><span>TOTAL</span><span>${formatBRL(sale.total)}</span></div>
      <hr class="divider" />
      ${paymentsHtml}
      ${sale.change && sale.change > 0 ? `<div class="info-line" style="font-weight:bold"><span>Troco</span><span>${formatBRL(sale.change)}</span></div>` : ""}
      <hr class="divider" />
      <div class="footer">Obrigado pela preferencia!</div>
      ${footerHtml}
    </div>
  `;

  printHtml(html);
}

// ===== API pública =====

/** Imprime o comprovante: serviço local primeiro, fallback HTML. Nunca lança. */
export async function printSaleReceipt(sale: SaleReceiptData): Promise<void> {
  const store = storeInfo();
  try {
    const printed = await printViaService(sale, store);
    if (printed) return;
    printSaleReceiptHtml(sale, store);
  } catch {
    // Impressão nunca deve quebrar o fluxo de venda.
  }
}
