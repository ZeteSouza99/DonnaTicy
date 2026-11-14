"use client";
import { useEffect, useState } from "react";
import { Save, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";
import { useApiQuery } from "@/hooks/use-api-query";
import { useSessionUser } from "@/components/layout/session-context";
import { can } from "@/lib/permissions";
import { clientFetch } from "@/lib/client-fetch";
import { DEFAULT_OPERATIONAL_SETTINGS, type OperationalSettings } from "@/lib/operational-settings";
export default function ParametersPage() {
 const { data, loading, error, refresh } = useApiQuery<OperationalSettings>("/api/settings");
 const [form,setForm] = useState(DEFAULT_OPERATIONAL_SETTINGS), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
 const [saveError,setSaveError] = useState<string|null>(null);
 const user = useSessionUser(), editable = can(user.role,"settings","manage");
 useEffect(() => { if(data) setForm(data); },[data]);
 useEffect(() => { if(!data || JSON.stringify(form) === JSON.stringify(data)) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload",warn); return () => window.removeEventListener("beforeunload",warn); },[form,data]);
 async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); setMessage(""); setSaveError(null); try { await clientFetch("/api/settings",{method:"PUT",body:form}); setMessage("Parâmetros salvos."); refresh(); } catch(e) {setSaveError(e instanceof Error ? e.message : "Erro ao salvar.");} finally {setBusy(false);} }
 if(loading && !data) return <LoadingSpinner />;
 if(error && !data) return <ErrorMessage message={error} onRetry={refresh} />;
 return <div className="max-w-3xl"><PageHeader title="Parâmetros da operação" description="Regras usadas nos indicadores e na emissão de novos vales-troca." /><form onSubmit={save} className="space-y-6"><div className="panel space-y-6">
  <label className="block"><span className="field-label">Meta mensal de vendas (R$)</span><input type="number" min="0" max="999999999" step="0.01" className="field-input" disabled={!editable} value={form.monthlySalesGoal} onChange={(e)=>setForm({...form,monthlySalesGoal:Number(e.target.value)})} /><p className="field-hint">Meta geral exibida no dashboard. Use zero para não definir uma meta.</p></label>
  <label className="block"><span className="field-label">Cliente ativo: compra nos últimos quantos dias?</span><input type="number" min="1" max="730" className="field-input" disabled={!editable} value={form.activeCustomerDays} onChange={(e)=>setForm({...form,activeCustomerDays:Number(e.target.value)})} /></label>
  <label className="block"><span className="field-label">Validade dos novos vales-troca (dias)</span><input type="number" min="0" max="3650" className="field-input" disabled={!editable} value={form.storeCreditValidityDays} onChange={(e)=>setForm({...form,storeCreditValidityDays:Number(e.target.value)})} /><p className="field-hint">Zero mantém o vale sem vencimento. Vales já emitidos preservam a validade original.</p></label>
 </div><p className="text-xs text-gray-500">Emissão fiscal e recebimento automático por banco dependem de provedores configurados. O registro de entradas e pagamentos internos continua disponível.</p>{saveError && <ErrorMessage message={saveError}/>} {message && <p role="status" className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800">{message}</p>}<div className="form-actions flex justify-end">{editable ? <button className="btn-primary" disabled={busy}><Save size={16} />{busy ? "Salvando…" : "Salvar parâmetros"}</button> : <p className="text-sm text-gray-500"><Check className="mr-2 inline" size={16} />Somente administradores podem alterar estes parâmetros.</p>}</div></form></div>;
}
