"use client";
import { useState } from "react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebounce } from "@/hooks/use-debounce";
export function CustomerPicker({ value, onChange, selectedName }: { value: string; selectedName?: string; onChange: (id:string) => void }) {
 const [search,setSearch] = useState("");
 const term = useDebounce(search,250);
 const {data,error,loading} = useApiQuery<{data:Array<{id:string;fullName:string}>}>(`/api/customers?limit=20&search=${encodeURIComponent(term)}`);
 return <div className="min-w-0 flex-1 space-y-2"><input aria-label="Buscar cliente por nome ou telefone" placeholder="Buscar nome ou telefone…" value={search} onChange={(e)=>setSearch(e.target.value)} className="field-input" /><select aria-label="Selecionar cliente" className="field-input" value={value} onChange={(e)=>onChange(e.target.value)}><option value="">Consumidor Final</option>{value && !data?.data.some((c)=>c.id===value) && <option value={value}>{selectedName ?? "Cliente selecionado"}</option>}{data?.data.map((c)=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}{loading && <span className="text-xs text-gray-500">Buscando clientes…</span>}</div>;
}
