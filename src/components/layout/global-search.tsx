"use client";
import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import Link from "next/link";
import { Search, X, ArrowUpRight } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebounce } from "@/hooks/use-debounce";
export function GlobalSearch() {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useDialogFocus(open ? "global-search-dialog" : null, () => setOpen(false));
  const term = useDebounce(query.trim(), 250);
  const { data, error, loading } = useApiQuery<{ results: Array<{ id: string; label: string; detail: string; href: string }> }>(open && term.length >= 2 ? `/api/search?q=${encodeURIComponent(term)}` : null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); setOpen(true); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  return <>
    <button onClick={() => setOpen(true)} className="search-trigger" aria-label="Buscar produtos, clientes e pedidos"><Search size={18} /><span className="hidden lg:inline">Buscar no sistema</span><kbd className="hidden xl:inline">Ctrl /</kbd></button>
    {open && <div className="dialog-backdrop" onClick={() => setOpen(false)}><section id="global-search-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Buscar no sistema" className="search-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if(e.key === "Tab") { const focusable = e.currentTarget.querySelectorAll<HTMLElement>('button, input, a[href]'); const first = focusable[0], last = focusable[focusable.length - 1]; if(e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if(!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}>
      <div className="flex items-center gap-3 border-b p-4"><Search size={20} className="text-brand-600" /><input ref={input} aria-label="Termo de busca" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, código ou telefone…" className="min-w-0 flex-1 border-0 bg-transparent outline-none" /><button onClick={() => setOpen(false)} aria-label="Fechar busca" className="icon-button"><X size={20} /></button></div>
      <div className="max-h-[60dvh] overflow-y-auto p-2" aria-live="polite">
        {term.length < 2 ? <p className="p-6 text-sm text-gray-500">Digite pelo menos duas letras para buscar.</p> : loading ? <p className="p-6 text-sm text-gray-500">Buscando…</p> : error ? <p className="p-6 text-sm text-red-700">{error}</p> : !data?.results.length ? <p className="p-6 text-sm text-gray-500">Nenhum resultado para “{term}”.</p> : data.results.map((item) => <Link onClick={() => setOpen(false)} key={item.id} href={item.href} className="flex items-center justify-between gap-4 rounded-xl p-3 hover:bg-brand-50"><span><span className="block text-sm font-semibold text-gray-900">{item.label}</span><span className="text-xs text-gray-500">{item.detail}</span></span><ArrowUpRight size={17} className="shrink-0 text-gray-400" /></Link>)}
      </div>
    </section></div>}
  </>;
}
