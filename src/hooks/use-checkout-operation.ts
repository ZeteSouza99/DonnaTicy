"use client";
import { useEffect, useRef, useState } from "react";
import { clientFetch, ApiError } from "@/lib/client-fetch";
type Pending = { key: string; input: unknown };
export function useCheckoutOperation(userId: string, scope: "orders" | "exchanges" = "orders") {
 const storageKey = `donnaticy.checkout.${scope}.${userId}`;
 const [pending,setPending] = useState<Pending | null>(null);
 const operation = useRef<Pending | null>(null), busy = useRef(false);
 useEffect(() => { try { const saved = sessionStorage.getItem(storageKey); if(saved) { const parsed = JSON.parse(saved) as Pending; if(parsed.key && parsed.input) { operation.current = parsed; setPending(parsed); } } } catch {} },[storageKey]);
 async function submit<T>(input?: unknown): Promise<T> {
  if(busy.current) throw new Error("A venda já está sendo enviada. Aguarde.");
  busy.current = true;
  try {
   if(!operation.current) {
    if(!input) throw new Error("Nenhuma venda pendente.");
    operation.current = {key:crypto.randomUUID(),input};
    try { sessionStorage.setItem(storageKey,JSON.stringify(operation.current)); } catch { operation.current = null; throw new Error("Não foi possível salvar a tentativa neste navegador. Libere o armazenamento para continuar."); }
    setPending(operation.current);
   }
   const result = await clientFetch<T>(scope === "orders" ? "/api/orders" : "/api/sales/exchanges", {method:"POST",headers:{"Idempotency-Key":operation.current.key},body:operation.current.input});
   try { sessionStorage.removeItem(storageKey); } catch {} operation.current = null; setPending(null);
   return result;
  } catch(error) {
   // Validação negativa é definitiva. Falha de rede/servidor preserva o mesmo identificador.
   if(error instanceof ApiError && [400,404,409,422].includes(error.status)) {
    try { sessionStorage.removeItem(storageKey); } catch {} operation.current = null; setPending(null);
   }
   throw error;
  } finally {busy.current = false;}
 }
 return {pending,submit};
}
