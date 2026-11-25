/**
 * Impressão de comprovante de venda (não fiscal) — Bematech MP-4200 TH.
 *
 * Estratégia (mesma estrutura do PDV Martcell):
 * 1. Tenta o serviço local de impressão (print-service/) em http://127.0.0.1:15555 → ESC/POS bruto.
 * 2. Se o serviço não estiver disponível, cai para impressão HTML 80mm via window.print().
 *
 * Habilitada por deploy via NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING (ver lib/features.ts).
 */

import { brand } from "./brand";

import { renderReceiptHtml, type SaleReceiptData, type StoreInfo } from "../../print-service/receipt-layout";
export type { SaleReceiptData, ReceiptItem, ReceiptPayment } from "../../print-service/receipt-layout";

// ===== Configuração =====

// Liberado na CSP (next.config.ts); o serviço escuta só em IPv4 loopback.
const PRINT_SERVICE_URL = "http://127.0.0.1:15555";
const HEALTH_CHECK_TIMEOUT = 1200;
const HEALTH_CACHE_ONLINE_MS = 60_000;
const HEALTH_CACHE_OFFLINE_MS = 15_000;

function storeInfo(): StoreInfo {
  return {
    storeName: brand.name === "DonnaTicy" ? "Donna Ticy" : brand.name,
    storeTagline: process.env.NEXT_PUBLIC_RECEIPT_TAGLINE ?? "MODA FITNESS",
    exchangePolicy: process.env.NEXT_PUBLIC_RECEIPT_EXCHANGE_POLICY,
    instagram: process.env.NEXT_PUBLIC_STORE_INSTAGRAM ?? "@donnaticy",
    timeZone: process.env.NEXT_PUBLIC_RECEIPT_TIMEZONE || "America/Manaus",
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
    document.body.classList.add("printing-receipt");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("printing-receipt");
      printRoot.style.display = "none";
      printRoot.innerHTML = "";
    }, 500);
  }, 200);
}

// ===== API pública =====

/** Diagnóstico explícito: não usa o cache nem envia trabalho à impressora. */
export async function checkPrintService(): Promise<string> {
  const response = await fetch(`${PRINT_SERVICE_URL}/status`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("O serviço de impressão recusou a conexão.");
  const result = await response.json();
  if (result.status !== "online" || typeof result.printer !== "string") {
    throw new Error("A resposta do serviço de impressão é inválida.");
  }
  serviceHealthCache = { online: true, checkedAt: Date.now() };
  return result.printer;
}

/** Uma amostra local; não chama a API de pedidos, estoque ou pagamentos. */
export async function printTestReceipt(): Promise<string> {
  const printer = await checkPrintService();
  const sample: SaleReceiptData = {
    code: "TESTE-WEB-USB",
    createdAt: new Date().toISOString(),
    customerName: "TESTE - SEM VALOR COMERCIAL",
    items: [{ name: "Peça de teste - impressão web", color: "Preto", size: "M", quantity: 1, unitPrice: 0, totalPrice: 0 }],
    subtotal: 0, discountTotal: 0, total: 0, payments: [],
  };
  const response = await fetch(`${PRINT_SERVICE_URL}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "sale_receipt", data: sample, store: {
      ...storeInfo(), storeTagline: "TESTE DE IMPRESSÃO WEB",
      exchangePolicy: "Amostra de teste. Nenhuma venda foi registrada. Este código não é válido para troca.",
      receiptFooter: "TESTE - SEM VALOR COMERCIAL",
    } }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok || result.success !== true) {
    throw new Error(typeof result.error === "string" ? result.error : "O serviço não confirmou o envio à fila.");
  }
  return printer;
}

/** Imprime o comprovante: serviço local primeiro, fallback HTML. Nunca lança. */
export async function printSaleReceipt(sale: SaleReceiptData): Promise<void> {
  const store = storeInfo();
  try {
    const printed = await printViaService(sale, store);
    if (printed) return;
    printHtml(renderReceiptHtml(sale, store));
  } catch {
    // Impressão nunca deve quebrar o fluxo de venda.
  }
}
