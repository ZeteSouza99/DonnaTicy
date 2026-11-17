"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, CheckCircle2, Loader2 } from "lucide-react";
import { useSessionUser } from "@/components/layout/session-context";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorMessage, LoadingSpinner } from "@/components/ui/feedback";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebounce } from "@/hooks/use-debounce";
import { clientFetch } from "@/lib/client-fetch";
import { can } from "@/lib/permissions";
import { movementInput, movementReasons, type MovementKind } from "@/lib/inventory-movement";

interface Variant {
  id: string; sku: string; product: { name: string }; color: { name: string }; size: { name: string };
  stockPositions: { locationId: string; quantity: number; reservedQty: number }[];
}
type Location = { id: string; name: string; isActive: boolean };
const kinds = [
  { value: "entry", label: "Entrada", detail: "Acrescentar peças ao estoque", icon: ArrowDownToLine },
  { value: "exit", label: "Saída", detail: "Retirar peças de um local", icon: ArrowUpFromLine },
  { value: "transfer", label: "Transferência", detail: "Levar peças para outro local", icon: ArrowLeftRight },
] as const;
const variantLabel = (v: Variant) => v.product.name + " · " + v.color.name + " · " + v.size.name;

export default function MovimentarEstoquePage() {
  const user = useSessionUser();
  const allowed = can(user.role, "inventory", "write");
  const [kind, setKind] = useState<MovementKind>("entry");
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<Variant | null>(null);
  const [locationId, setLocationId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [search, setSearch] = useState("");
  const term = useDebounce(search, 250);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("ADJUSTMENT");
  const [notes, setNotes] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const pending = useRef(false);
  const variants = useApiQuery<{ data: Variant[]; total: number }>(
    allowed && !initializing && !selected ? "/api/catalog/variants?limit=20&search=" + encodeURIComponent(term) : null
  );

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const query = new URLSearchParams(window.location.search);
    const variantId = query.get("variantId");
    Promise.all([
      clientFetch<{ data: Location[] }>("/api/inventory/locations?limit=500", { signal: controller.signal }),
      variantId ? clientFetch<Variant>("/api/catalog/variants/" + encodeURIComponent(variantId), { signal: controller.signal }) : Promise.resolve(null),
    ]).then(([result, variant]) => {
      if (controller.signal.aborted) return;
      const activeLocations=result.data.filter(l=>l.isActive);
      setLocations(activeLocations);
      setSelected(variant);
      const preferred = query.get("locationId") || user.locationId;
      setLocationId(activeLocations.some(l => l.id === preferred) ? preferred! : activeLocations.length === 1 ? activeLocations[0].id : "");
      setInitialError("");
      setInitializing(false);
    }).catch(e => {
      if (!controller.signal.aborted) { setInitialError(e instanceof Error ? e.message : "Não foi possível carregar as opções."); setInitializing(false); }
    });
    return () => controller.abort();
  }, [allowed, user.locationId, revision]);

  function changeKind(value: MovementKind) {
    setKind(value); setReason(value === "transfer" ? "TRANSFER" : "ADJUSTMENT"); setError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || completed) return;
    setError("");
    try {
      const body = movementInput({ kind, variantId: selected?.id ?? "", locationId, destinationId, quantity, reason, notes });
      if (!locations.some(l => l.id === locationId) || (kind === "transfer" && !locations.some(l => l.id === destinationId))) throw new Error("Selecione um local de estoque disponível.");
      pending.current = true; setSubmitting(true);
      await clientFetch("/api/inventory/movements", { method: "POST", body });
      setCompleted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar. Consulte o estoque antes de tentar novamente.");
    } finally { pending.current = false; setSubmitting(false); }
  }
  if (!allowed) return <ErrorMessage message="Seu perfil não permite movimentar estoque." />;
  if (initializing) return <LoadingSpinner />;
  if (initialError) return <ErrorMessage message={initialError} onRetry={() => { setInitializing(true); setRevision(n => n + 1); }} />;
  const local = locations.find(l => l.id === locationId)?.name;
  const destination = locations.find(l => l.id === destinationId)?.name;
  const available = selected?.stockPositions.find(p => p.locationId === locationId);
  const availableQuantity = available ? available.quantity - available.reservedQty : 0;
  const summary = selected && local && Number(quantity) > 0
    ? kind === "entry" ? "Acrescentar " + quantity + " peças em " + local + "."
      : kind === "exit" ? "Retirar " + quantity + " peças de " + local + "."
      : destination ? "Transferir " + quantity + " peças de " + local + " para " + destination + "." : ""
    : "";
  if (completed) return <section className="panel mx-auto max-w-2xl space-y-4" role="status">
    <CheckCircle2 className="text-green-600" size={32} /><h1 className="text-xl font-semibold">Movimentação registrada</h1>
    <p>{selected && variantLabel(selected)}</p><p>{summary}</p>
    <Link className="btn-primary" href="/dashboard/estoque">Conferir estoque</Link>
  </section>;
  return <div className="mx-auto max-w-3xl space-y-6">
    <PageHeader title="Movimentar estoque" description="Escolha a operação e confira o resumo antes de registrar." actions={<Link className="btn-secondary" href="/dashboard/estoque">Voltar ao estoque</Link>} />
    {can(user.role,"imports","write") && <p className="text-sm text-gray-600">Recebeu uma nota do fornecedor? <Link className="font-medium text-brand-700 underline" href="/dashboard/catalogo/importar">Importar mercadorias por nota ou planilha</Link>.</p>}
    {!locations.length ? <ErrorMessage message="Nenhum local de estoque ativo. Cadastre um local antes de movimentar." /> : <form onSubmit={submit} className="panel space-y-5">
      <fieldset disabled={submitting} className="space-y-5 disabled:opacity-70">
        <legend className="sr-only">Dados da movimentação</legend>
        <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Tipo de movimentação">{kinds.map(({value,label,detail,icon:Icon}) => <button key={value} type="button" aria-pressed={kind===value} onClick={() => changeKind(value)} className={"rounded-xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-brand-600 " + (kind===value ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:bg-gray-50")}>
          <Icon size={22} className="mb-2 text-brand-600" /><strong className="block text-sm">{label}</strong><span className="text-xs text-gray-600">{detail}</span>
        </button>)}</div>
        {selected ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 p-4"><div><span className="text-xs text-gray-500">Produto selecionado</span><p className="font-semibold">{variantLabel(selected)}</p><p className="text-xs text-gray-500">{selected.sku}</p></div><button type="button" className="btn-secondary" onClick={() => { setSelected(null); setSearch(""); }}>Trocar produto</button></div>
          : <div className="space-y-2"><label className="block"><span className="field-label">Buscar produto</span><input className="field-input" placeholder="Nome, SKU ou código de barras" value={search} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}} onChange={e=>setSearch(e.target.value)} /></label>
            {variants.loading || search!==term ? <p role="status" className="text-sm text-gray-500">Buscando produtos…</p> : variants.error ? <ErrorMessage message={variants.error} onRetry={variants.refresh}/> : <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
              {variants.data?.data.map(v=><button key={v.id} type="button" onClick={()=>setSelected(v)} className="block w-full border-b border-gray-100 px-3 py-3 text-left hover:bg-brand-50 focus-visible:bg-brand-50"><span className="block text-sm font-medium">{variantLabel(v)}</span><span className="text-xs text-gray-500">{v.sku}</span></button>)}
              {variants.data?.data.length===0 && <p className="p-3 text-sm text-gray-500">Nenhum produto encontrado. Tente outro nome ou código.</p>}
            </div>}
            {!!variants.data && variants.data.total>20 && <p className="text-xs text-gray-500">Mostrando até 20 resultados. Refine a busca para localizar o produto.</p>}
          </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="field-label">{kind==="entry" ? "Local que receberá as peças" : "Local de onde sairão as peças"}</span><select required className="field-input" value={locationId} onChange={e=>setLocationId(e.target.value)}><option value="">Selecione o local</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          {kind==="transfer" && <label><span className="field-label">Local de destino</span><select required className="field-input" value={destinationId} onChange={e=>setDestinationId(e.target.value)}><option value="">Selecione outro local</option>{locations.filter(l=>l.id!==locationId).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
          <label><span className="field-label">Quantidade de peças</span><input required className="field-input" type="number" min="1" max="2147483647" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} /></label>
          {kind!=="transfer" && <label><span className="field-label">Motivo</span><select className="field-input" value={reason} onChange={e=>setReason(e.target.value)}>{movementReasons[kind].map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label>}
        </div>
        {selected && locationId && <p className="text-sm text-gray-600">Disponível em {local}: <strong>{availableQuantity} peças</strong>. O saldo será conferido novamente ao registrar.</p>}
        {reason==="SALE" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Esta baixa altera apenas o estoque. {can(user.role,"orders","write") ? <Link className="underline" href="/dashboard/vendas">Para registrar uma venda e seu pagamento, abra o caixa.</Link> : "Uma venda com pagamento deve ser registrada no caixa."}</p>}
        <label className="block"><span className="field-label">Observações</span><textarea className="field-input" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} /></label>
        {summary && <div className="rounded-xl border border-brand-200 bg-brand-50 p-4" aria-live="polite"><h2 className="text-sm font-semibold">Confira antes de registrar</h2><p className="mt-1 text-sm">{selected && variantLabel(selected)}</p><p className="mt-1 text-sm">{summary}</p></div>}
        {error && <ErrorMessage message={error}/>}
        <div className="flex flex-wrap justify-end gap-3"><button type="submit" disabled={!selected||!locationId||!quantity||(kind==="transfer"&&(!destinationId||destinationId===locationId))} className="btn-primary">{submitting && <Loader2 size={16} className="animate-spin"/>}{submitting ? "Registrando…" : kind==="entry" ? "Registrar entrada" : kind==="exit" ? "Registrar saída" : "Registrar transferência"}</button></div>
      </fieldset>
    </form>}
  </div>;
}
