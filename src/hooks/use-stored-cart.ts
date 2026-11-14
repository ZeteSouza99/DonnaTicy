"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
const itemSchema = z.object({ variantId:z.string(), sku:z.string(), productName:z.string(), colorName:z.string(), colorHex:z.string().nullish(), sizeName:z.string(), unitPrice:z.number().nonnegative(), quantity:z.number().int().positive(), available:z.number().nonnegative() });
export type CartItem = z.infer<typeof itemSchema>;
export function useStoredCart(userId: string) {
 const [cart,setCart] = useState<CartItem[]>([]), [ready,setReady] = useState(false), [restored,setRestored] = useState(false);
 const key = `donnaticy.cart.${userId}`;
 useEffect(() => {
  // Hidratação do armazenamento do navegador após o primeiro render do servidor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  try { const saved = sessionStorage.getItem(key); if(saved) { const parsed = z.object({ savedAt:z.number(), items:z.array(itemSchema).max(200) }).parse(JSON.parse(saved)); if(Date.now()-parsed.savedAt < 86400000) { setCart(parsed.items); setRestored(parsed.items.length > 0); } } } catch { try { sessionStorage.removeItem(key); } catch {} }
  setReady(true);
 },[key]);
 useEffect(() => { if(!ready) return; try { if(cart.length) sessionStorage.setItem(key,JSON.stringify({ savedAt:Date.now(),items:cart })); else sessionStorage.removeItem(key); } catch {} },[cart,key,ready]);
 return {cart,setCart,ready,restored};
}
