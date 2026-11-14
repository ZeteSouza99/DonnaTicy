"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Play, Plus } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { clientFetch } from "@/lib/client-fetch";
import { ErrorMessage } from "@/components/ui/feedback";
import { useSessionUser } from "@/components/layout/session-context";
import { can } from "@/lib/permissions";
import { automationAvailability } from "@/lib/automation-config";

type Rule = { id: string; name: string; conditionType: string; conditionConfig: unknown; actionType: string; actionConfig: unknown; isActive: boolean; totalFired: number };
type Task = { id: string; title: string; createdAt: string; customer: { id: string; fullName: string } };
const conditions: Record<string,string> = { BIRTHDAY: "Aniversário", CHURN_RISK: "Cliente sem comprar", REPURCHASE_WINDOW: "Prazo de recompra", LTV_MILESTONE: "Valor acumulado de compras", POST_DELIVERY: "Compra entregue recentemente" };
const actions: Record<string,string> = { CREATE_TASK: "Criar tarefa", ASSIGN_POINTS: "Conceder pontos", UPGRADE_TIER: "Elevar categoria" };
export function AutomationPanel() {
 const user = useSessionUser(), writable = can(user.role,"crm","write");
 const rules = useApiQuery<{data: Rule[]}>("/api/crm/automations?limit=100");
 const tasks = useApiQuery<{data: Task[]}>("/api/crm/tasks");
 const [form,setForm] = useState(false),[busy,setBusy] = useState(false),[error,setError] = useState<string|null>(null),[notice,setNotice] = useState("");
 const [name,setName] = useState(""),[condition,setCondition] = useState("CHURN_RISK"),[days,setDays] = useState(60),[amount,setAmount] = useState(1000),[action,setAction] = useState("CREATE_TASK"),[title,setTitle] = useState("Acompanhar cliente"),[points,setPoints] = useState(100),[tier,setTier] = useState("GOLD");
 async function mutate(path: string,method: string,body?: unknown) {
  setBusy(true);setError(null);setNotice("");
  try { const result = await clientFetch<{processed?:number}>(path,{method,body}); rules.refresh();tasks.refresh(); if(result.processed !== undefined) setNotice(`${result.processed} ações internas executadas.`); return true; }
  catch(err) { setError(err instanceof Error ? err.message : "Não foi possível concluir.");return false; }
  finally {setBusy(false);}
 }
 async function create(event: React.FormEvent) {
  event.preventDefault();
  if(await mutate("/api/crm/automations","POST",{name,conditionType:condition,conditionConfig:{days,amount},actionType:action,actionConfig:{title,points,tier},channels:[],throttleDays:30,isActive:true})) {setForm(false);setName("");}
 }
 return <div className="space-y-6">
 <section className="panel"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="panel-title">Relacionamento e tarefas</h2><p className="mt-1 text-sm text-gray-500">Ações internas com histórico e intervalo mínimo de 30 dias nas novas regras.</p></div>{writable && <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy} onClick={() => mutate("/api/crm/automations/run","POST")}><Play size={15}/> Executar regras</button><button className="btn-primary" onClick={() => setForm(!form)} aria-expanded={form}><Plus size={15}/> Nova regra</button></div>}</div>
 {error && <ErrorMessage message={error}/>} {notice && <p role="status" className="mb-4 text-sm text-brand-700">{notice}</p>}
 {form && <form onSubmit={create} className="mb-6 grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
 <label><span className="field-label">Nome da regra</span><input className="field-input" value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={100}/></label>
 <label><span className="field-label">Quando executar</span><select className="field-input" value={condition} onChange={e=>setCondition(e.target.value)}>{Object.entries(conditions).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
 {condition === "LTV_MILESTONE" ? <label><span className="field-label">Compras acumuladas a partir de R$</span><input className="field-input" type="number" min={1} max={10000000} value={amount} onChange={e=>setAmount(Number(e.target.value))} required/></label> : condition !== "BIRTHDAY" && <label><span className="field-label">Período em dias</span><input className="field-input" type="number" min={1} max={730} value={days} onChange={e=>setDays(Number(e.target.value))} required/></label>}
 <label><span className="field-label">Ação interna</span><select className="field-input" value={action} onChange={e=>setAction(e.target.value)}>{Object.entries(actions).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
 {action === "CREATE_TASK" && <label className="sm:col-span-2"><span className="field-label">Título da tarefa</span><input className="field-input" value={title} onChange={e=>setTitle(e.target.value)} required minLength={2} maxLength={200}/></label>}
 {action === "ASSIGN_POINTS" && <label><span className="field-label">Pontos de bônus</span><input type="number" className="field-input" value={points} onChange={e=>setPoints(Number(e.target.value))} min={1} max={10000} required/></label>}
 {action === "UPGRADE_TIER" && <label><span className="field-label">Categoria mínima</span><select className="field-input" value={tier} onChange={e=>setTier(e.target.value)}>{["BRONZE","SILVER","GOLD","VIP"].map(value=><option key={value}>{value}</option>)}</select></label>}
 <div className="form-actions flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-secondary" onClick={()=>setForm(false)}>Cancelar</button><button className="btn-primary" disabled={busy}>Salvar regra</button></div></form>}
 {rules.error && <ErrorMessage message={rules.error} onRetry={rules.refresh}/>}
 <div className="divide-y divide-gray-100">{rules.data?.data.map(rule => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium text-gray-900">{rule.name}</p><p className="mt-1 text-xs text-gray-500">{conditions[rule.conditionType] ?? rule.conditionType} · {actions[rule.actionType] ?? "Envio externo"} · {rule.totalFired} execuções</p>{automationAvailability(rule) !== "READY" && <p className="mt-1 text-xs text-amber-700">Executor ou provedor ainda não configurado. Esta regra não é executada.</p>}</div>{writable && <button className="btn-secondary" disabled={busy || (!rule.isActive && automationAvailability(rule) !== "READY")} onClick={()=>mutate(`/api/crm/automations/${rule.id}`,"PUT",{isActive:!rule.isActive})}>{rule.isActive ? "Pausar" : "Ativar"}</button>}</div>)}</div>
 {!rules.loading && !rules.data?.data.length && <p className="text-sm text-gray-500">Crie uma regra para gerar acompanhamentos, pontos ou mudanças de categoria.</p>}
 <p className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-500">WhatsApp, e-mail e SMS dependem de integração com um provedor e da autorização do cliente. Nenhuma mensagem externa é enviada por estas rotinas.</p>
 </section>
 <section className="panel"><h2 className="panel-title mb-4">Tarefas abertas</h2>{tasks.error && <ErrorMessage message={tasks.error} onRetry={tasks.refresh}/>}<div className="divide-y divide-gray-100">{tasks.data?.data.map(task=><div key={task.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{task.title}</p><Link href={`/dashboard/clientes/${task.customer.id}`} className="mt-1 text-xs text-brand-700 underline underline-offset-4">{task.customer.fullName}</Link></div>{writable && <button className="btn-secondary" disabled={busy} onClick={()=>mutate(`/api/crm/tasks/${task.id}`,"PATCH")}><Check size={15}/> Concluir</button>}</div>)}</div>{!tasks.loading && !tasks.data?.data.length && <p className="text-sm text-gray-500">Tudo em dia. Nenhuma tarefa aberta.</p>}</section>
 </div>;
}
