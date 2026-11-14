"use client";
import { useEffect, useEffectEvent } from "react";
/** Mantém o foco no diálogo ativo e devolve-o ao controle que o abriu. */
export function useDialogFocus(id: string | null, onClose: () => void) {
 const close = useEffectEvent(onClose);
 useEffect(() => {
  if (!id) return;
  const root = document.getElementById(id); if (!root) return;
  const previous = document.activeElement as HTMLElement | null;
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const targets = () => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
  const focusFirst = () => (targets()[0] ?? root).focus();
  focusFirst();
  const key = (event: KeyboardEvent) => {
   if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
   if (event.key === "Tab") {
    const all = targets(), first = all[0], last = all.at(-1);
    if (!first) { event.preventDefault(); root.focus(); }
    else if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
   }
  };
  const focus = (event: FocusEvent) => { if (root.isConnected && !root.contains(event.target as Node)) focusFirst(); };
  document.addEventListener("keydown",key,true);document.addEventListener("focusin",focus);
  return () => {document.removeEventListener("keydown",key,true);document.removeEventListener("focusin",focus);document.body.style.overflow=overflow;if(previous?.isConnected) previous.focus();};
 },[id]);
}
