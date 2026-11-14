export interface ReceiptItem {
  name: string;
  color?: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  /** Total bruto do item, antes dos abatimentos detalhados no rodapé. */
  totalPrice: number;
}
export interface ReceiptPayment { label: string; amount: number; installments?: number }
export interface SaleReceiptData {
  code: string;
  createdAt: string;
  sellerName?: string;
  customerName?: string;
  items: ReceiptItem[];
  subtotal: number;
  discountTotal: number;
  couponCode?: string;
  couponDiscount?: number;
  storeCreditCode?: string;
  usedStoreCreditAmount?: number;
  total: number;
  payments: ReceiptPayment[];
  change?: number;
  reprint?: boolean;
}
export interface StoreInfo {
  storeName: string;
  storeTagline?: string;
  storeCnpj?: string;
  storeAddress?: string;
  storePhone?: string;
  receiptFooter?: string;
  exchangePolicy?: string;
  instagram?: string;
  timeZone?: string;
}
export const DEFAULT_EXCHANGE_POLICY: string;
export function money(value: number): string;
export function clean(value: unknown): string;
export function itemName(item: ReceiptItem): string;
export function receiptDetails(sale: SaleReceiptData): { deductions: { label: string; amount: number }[]; subtotalLabel: string };
export function code128Bits(value: string): string | null;
export function receiptDate(value: string, timeZone?: string): string;
export function renderReceiptHtml(sale: SaleReceiptData, store?: Partial<StoreInfo>): string;
