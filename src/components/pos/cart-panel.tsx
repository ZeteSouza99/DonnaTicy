"use client";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import type { CartItem } from "@/hooks/use-stored-cart";
import { formatBRL } from "@/lib/format";
export function CartPanel({cart,itemCount,clearCart,changeQty,setQty,removeFromCart}:{cart:CartItem[];itemCount:number;clearCart:()=>void;changeQty:(id:string,delta:number)=>void;setQty:(id:string,quantity:number)=>void;removeFromCart:(id:string)=>void}) {
return (
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ShoppingCart size={16} />
                Carrinho ({itemCount} {itemCount === 1 ? "item" : "itens"})
              </h2>
              <button
                type="button"
                onClick={clearCart}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
              >
                <X size={12} /> Limpar
              </button>
            </div>
            <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
              {cart.map((i) => (
                <li key={i.variantId} className="flex flex-wrap items-center gap-2 px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-4">
                  <span
                    className="h-9 w-9 shrink-0 rounded-full border border-gray-200"
                    style={{ background: i.colorHex ?? "#e5e7eb" }}
                    title={i.colorName}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {i.productName}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {i.sku} · {i.colorName} / {i.sizeName} · {formatBRL(i.unitPrice)} / UN
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changeQty(i.variantId, -1)}
                      className="rounded-full border border-gray-300 p-1.5 hover:bg-gray-100"
                      aria-label="Diminuir"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      aria-label={`Quantidade de ${i.productName}`}
                      type="number"
                      min={1}
                      max={i.available}
                      value={i.quantity}
                      onChange={(e) => setQty(i.variantId, Number(e.target.value))}
                      className="w-12 rounded border border-gray-300 px-1 py-1 text-center text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => changeQty(i.variantId, +1)}
                      className="rounded-full border border-gray-300 p-1.5 hover:bg-gray-100"
                      aria-label="Aumentar"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="ml-auto w-20 text-right text-sm font-bold text-gray-900 sm:w-24">
                    {formatBRL(i.unitPrice * i.quantity)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(i.variantId)}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                    aria-label="Remover"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
);
}
