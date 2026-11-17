"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Plus, Trash2 } from "lucide-react";
import { ErrorMessage } from "@/components/ui/feedback";
import { useApiQuery } from "@/hooks/use-api-query";
import { clientFetch } from "@/lib/client-fetch";
import { readInvoiceFiles } from "@/lib/import/invoice-browser";
import { validateReceiptReview, validateReceiptDraft, type InvoiceDocument, type ReceiptReview } from "@/lib/import/invoice-document";

import { fillReceiptBlanks, singleReceiptOptions } from "@/lib/import/receipt-autofill";

type Option={id:string;name:string};
type Result={invoiceId:string;totalUnits:number;productsCreated:number;variantsCreated:number};
type Draft={id:string;status:string;document:InvoiceDocument;review?:ReceiptReview;summary:Partial<Result>};
type Options={locations:Option[];collections:Option[];lines:Option[];categories:Option[];history:{id:string;fileName:string;status:string}[]};
type Allocation=ReceiptReview["items"][number]["allocations"][number];
const field="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900";
const brl=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:Option[]}){
 return <label className="space-y-1 text-sm"><span>{label}</span><select className={field} value={value} onChange={e=>onChange(e.target.value)}><option value="">Selecione</option>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;
}
function VariantSearch({value,onChange}:{value:Allocation;onChange:(a:Allocation)=>void}){
 const [search,setSearch]=useState("");const [results,setResults]=useState<Array<{id:string;sku:string;product:{name:string};color:{name:string};size:{name:string}}>>([]);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function find(){setBusy(true);setError("");try{const response=await clientFetch<{data:typeof results}>(`/api/catalog/variants?search=${encodeURIComponent(search)}&limit=20`);setResults(response.data);if(!response.data.length)setError("Nenhuma variante encontrada.");}catch(e){setError(e instanceof Error?e.message:"Não foi possível buscar.");}finally{setBusy(false);}}
 return <div className="space-y-2"><div className="flex gap-2"><input aria-label="Buscar variante por nome ou SKU" placeholder="Nome, SKU ou código de barras" className={field} value={search} onChange={e=>setSearch(e.target.value)}/><button type="button" className="btn-secondary" disabled={busy||search.trim().length<2} onClick={()=>void find()}>Buscar</button></div>
 <select aria-label="Variante cadastrada" className={field} value={value.variantId??""} onChange={e=>onChange({...value,variantId:e.target.value||undefined})}><option value="">Criar com cor e tamanho abaixo</option>{value.variantId&&!results.some(r=>r.id===value.variantId)&&<option value={value.variantId}>Variante vinculada</option>}{results.map(r=><option key={r.id} value={r.id}>{r.product.name} · {r.color.name} · {r.size.name} · {r.sku}</option>)}</select>{error&&<p className="text-sm text-amber-700" role="status">{error}</p>}</div>;
}

export function InvoiceImport({files,onBusyChange,onStart}:{files:File[];onBusyChange:(busy:boolean)=>void;onStart:()=>void}){
 const options=useApiQuery<Options>("/api/imports/invoices");
 const [draft,setDraft]=useState<Draft|null>(null);const [review,setReview]=useState<ReceiptReview|null>(null);
 const [busy,setBusy]=useState(false);const [progress,setProgress]=useState("");const [error,setError]=useState("");const [confirmed,setConfirmed]=useState(false);
 const [result,setResult]=useState<Partial<Result>|null>(null);const [bulkCategory,setBulkCategory]=useState("");const [markup,setMarkup]=useState("");
 const [bulkColor,setBulkColor]=useState("");const [bulkSize,setBulkSize]=useState("");const [bulkMessage,setBulkMessage]=useState("");
 function open(item:Draft){setDraft(item);setConfirmed(false);setBulkMessage("");setResult(item.status==="COMPLETED"?item.summary:null);setReview(item.review??{...singleReceiptOptions(options.data),confirmed:true,items:item.document.items.map(i=>({line:i.line,categoryId:"",salePrice:0,allocations:[{quantity:i.quantity,color:"",size:""}]}))});}
 async function read(){if(reading.current)return;reading.current=true;onStart();setBusy(true);setError("");setProgress("Lendo documento…");try{
  const document=await readInvoiceFiles(files,setProgress);open(await clientFetch<Draft>("/api/imports/invoices",{method:"POST",body:document}));options.refresh();
 }catch(e){setError(e instanceof Error?e.message:"Não foi possível ler a nota.");}finally{reading.current=false;setBusy(false);setProgress("");}}
 async function resume(id:string){onStart();setBusy(true);setError("");try{open(await clientFetch<Draft>(`/api/imports/invoices/${id}`));}catch(e){setError(e instanceof Error?e.message:"Não foi possível abrir.");}finally{setBusy(false);}}
 function itemChange(index:number,patch:Partial<ReceiptReview["items"][number]>){setConfirmed(false);setReview(current=>current?{...current,items:current.items.map((v,i)=>i===index?{...v,...patch}:v)}:current);}
 function allocationChange(index:number,n:number,value:Allocation){if(review)itemChange(index,{allocations:review.items[index].allocations.map((v,i)=>i===n?value:v)});}
 async function save(commit:boolean){if(!draft||!review)return;setError("");try{
  if(commit&&!confirmed)throw new Error("Confirme a conferência das quantidades, cores, tamanhos e preços.");
  if(commit)validateReceiptReview(draft.document,review);else validateReceiptDraft(draft.document,review);setBusy(true);
  if(commit){const r=await clientFetch<Result>(`/api/imports/invoices/${draft.id}`,{method:"POST",body:review});setResult(r);setDraft({...draft,status:"COMPLETED",summary:r});}
  else{open(await clientFetch<Draft>(`/api/imports/invoices/${draft.id}`,{method:"PUT",body:review}));setProgress("Conferência salva.");}
  options.refresh();
 }catch(e){setError(e instanceof Error?e.message:"Não foi possível confirmar. Consulte o histórico antes de reenviar.");}finally{setBusy(false);}}
 useEffect(()=>{onBusyChange(busy);},[busy,onBusyChange]);
 const reading=useRef(false);
 const done=draft?.status==="COMPLETED";
 return <div className="mx-auto max-w-5xl space-y-6">
 <div className="space-y-3"><button className="btn-primary" disabled={busy||!options.data||!files.length||!!draft} onClick={()=>void read()}>{busy?<Loader2 size={16} className="animate-spin"/>:<Upload size={16}/>} Ler arquivo</button><p className="text-sm text-gray-500">A leitura salva uma conferência. O estoque só muda em “Confirmar entrada”.</p></div>
 {progress&&<p className="text-sm" role="status">{progress}</p>}{(error||options.error)&&<ErrorMessage message={error||String(options.error)}/>}
 {draft&&review&&<section className="panel space-y-5 p-6">
 <h2 className="font-semibold">2. Confira a NF {draft.document.number} · série {draft.document.series}</h2>
 <p>{draft.document.supplierName} · {draft.document.issueDate.split("-").reverse().join("/")}</p>
 <div className="flex flex-wrap gap-4 text-sm"><span>{draft.document.items.length} itens · {draft.document.items.reduce((s,i)=>s+i.quantity,0)} peças</span><span>Produtos: {brl(draft.document.productsTotal)}</span><span>Frete: {brl(draft.document.freight)}</span><span>Total: {brl(draft.document.invoiceTotal)}</span></div>
 <p className="break-all text-xs text-gray-500">Chave: {draft.document.accessKey}</p>
 {draft.document.source==="ocr"&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Leitura de imagem: confira os códigos e valores com o documento original. Nenhuma informação ilegível é preenchida por suposição.</p>}
 <p className="text-sm text-gray-600">A nota pode reunir tamanhos e cores na mesma linha. Distribua a quantidade conforme as peças recebidas. Preços de venda de produtos já cadastrados são preservados. Esta entrada registra a nota e o estoque; não cria uma conta a pagar.</p>
 <fieldset disabled={busy||done} className="space-y-5 disabled:opacity-70">
 <div className="grid gap-4 sm:grid-cols-3">{([['locationId','Estoque de destino','locations'],['collectionId','Coleção dos novos produtos','collections'],['lineId','Linha dos novos produtos','lines']] as const).map(([key,label,list])=><Select key={key} label={label} value={review[key]} options={options.data?.[list]??[]} onChange={v=>{setReview({...review,[key]:v});setConfirmed(false);}}/>)}</div>

 <div className="rounded-xl bg-gray-50 p-4 space-y-3">
  <h3 className="text-sm font-medium">Preencher campos vazios</h3>
  <p className="text-sm text-gray-600">Informe só o que for comum aos novos produtos. Valores já preenchidos e variantes cadastradas serão preservados.</p>
  <div className="grid gap-3 sm:grid-cols-2">
   <Select label="Categoria para campos vazios" value={bulkCategory} options={options.data?.categories??[]} onChange={setBulkCategory}/>
   <label className="text-sm">Multiplicador do custo com frete<input className={field} type="number" min="0.01" step="0.01" placeholder="Ex.: 2,5" value={markup} onChange={e=>setMarkup(e.target.value)}/><span className="text-xs text-gray-500">Ex.: custo de R$ 40 × 2,5 = venda a R$ 100.</span></label>
   <label className="text-sm">Cor para campos vazios<input className={field} maxLength={60} placeholder="Ex.: Preto" value={bulkColor} onChange={e=>setBulkColor(e.target.value)}/></label>
   <label className="text-sm">Tamanho para campos vazios<input className={field} maxLength={10} placeholder="Ex.: M" value={bulkSize} onChange={e=>setBulkSize(e.target.value)}/></label>
  </div>
  <button className="btn-secondary" type="button" disabled={!bulkCategory&&!markup&&!bulkColor.trim()&&!bulkSize.trim()} onClick={()=>{
   try { const filled=fillReceiptBlanks(draft.document,review,{categoryId:bulkCategory,color:bulkColor,size:bulkSize,multiplier:markup});setReview(filled.review);if(filled.changed)setConfirmed(false);setError("");setBulkMessage(filled.changed?filled.changed+" campos preenchidos. Confira os itens antes de confirmar a entrada.":"Nenhum campo vazio para preencher com esses valores."); }
   catch(e){setError(e instanceof Error?e.message:"Confira os valores para preenchimento.");setBulkMessage("");}
  }}>Preencher campos vazios</button>
  {bulkMessage&&<p role="status" className="text-sm text-brand-700">{bulkMessage}</p>}
 </div>
 {draft.document.items.map((item,index)=>{
  const row=review.items[index];const allocated=row.allocations.reduce((s,a)=>s+a.quantity,0);const needsNew=row.allocations.some(a=>!a.variantId);
  return <article key={item.line} className="rounded-xl border border-gray-200 p-4 space-y-4"><div><h3 className="font-semibold">{item.line}. {item.description}</h3><p className="text-sm text-gray-500">Código do fornecedor {item.code} · {item.quantity} peças · custo unitário {brl(item.unitPrice)} · total {brl(item.total)}</p></div>
  {draft.document.source==="ocr"&&<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm text-amber-900">Confira o código e a descrição com a nota. A leitura de imagem pode confundir letras e números.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Código conferido do item {item.line}<input className={field} maxLength={200} value={row.code??item.code} onChange={e=>itemChange(index,{code:e.target.value})}/></label><label className="text-sm">Descrição conferida do item {item.line}<input className={field} maxLength={200} value={row.description??item.description} onChange={e=>itemChange(index,{description:e.target.value})}/></label></div></div>}
  {needsNew&&<div className="grid gap-3 sm:grid-cols-2"><Select label={`Categoria do item ${item.line}`} value={row.categoryId} options={options.data?.categories??[]} onChange={categoryId=>itemChange(index,{categoryId})}/><label className="text-sm">Preço de venda dos novos produtos<input className={field} type="number" step="0.01" min="0.01" value={row.salePrice||""} onChange={e=>itemChange(index,{salePrice:Number(e.target.value)})}/></label></div>}
  {row.allocations.map((a,n)=><div key={n} className="rounded-lg bg-gray-50 p-3 space-y-3"><VariantSearch value={a} onChange={v=>allocationChange(index,n,v)}/><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{!a.variantId&&<><label className="text-sm">Cor<input className={field} maxLength={60} value={a.color} onChange={e=>allocationChange(index,n,{...a,color:e.target.value})}/></label><label className="text-sm">Tamanho<input className={field} maxLength={10} value={a.size} onChange={e=>allocationChange(index,n,{...a,size:e.target.value})}/></label></>}<label className="text-sm">Quantidade<input className={field} type="number" min="1" max={item.quantity} step="1" value={a.quantity||""} onChange={e=>allocationChange(index,n,{...a,quantity:Number(e.target.value)})}/></label>{row.allocations.length>1&&<button type="button" className="btn-secondary self-end" aria-label={`Remover variação ${n+1} do item ${item.line}`} onClick={()=>itemChange(index,{allocations:row.allocations.filter((_,i)=>i!==n)})}><Trash2 size={16}/> Remover</button>}</div></div>)}
  <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className="btn-secondary" disabled={row.allocations.length>=100} onClick={()=>itemChange(index,{allocations:[...row.allocations,{quantity:Math.max(0,item.quantity-allocated),color:"",size:""}]})}><Plus size={16}/> Dividir por cor/tamanho</button><span className={`text-sm ${allocated===item.quantity?'text-green-700':'text-amber-700'}`}>{allocated} de {item.quantity} peças distribuídas</span></div></article>;
 })}
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>Conferi a nota, as peças recebidas, a distribuição por cor e tamanho e os preços dos novos produtos.</label>
 <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" onClick={()=>void save(false)}>Salvar conferência</button><button type="button" className="btn-primary" disabled={!confirmed} onClick={()=>void save(true)}>{busy&&<Loader2 className="animate-spin" size={16}/>} Confirmar entrada</button></div>
 </fieldset>
 {result?.invoiceId&&<div role="status" className="rounded-lg bg-green-50 p-4 text-green-800"><p>Entrada concluída: {result.totalUnits} peças adicionadas. {result.productsCreated} produtos novos e {result.variantsCreated} variações novas.</p><Link className="underline" href={`/dashboard/notas-fiscais/${result.invoiceId}`}>Ver nota e itens</Link></div>}
 </section>}
 <section className="panel space-y-3 p-6"><h2 className="font-semibold">Conferências e entradas recentes</h2>{options.data?.history.map(h=><div key={h.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 py-3"><div><p className="break-all text-sm">{h.fileName}</p><p className="text-xs text-gray-500">{h.status==="COMPLETED"?"Entrada concluída":"Aguardando conferência"}</p></div><button className="btn-secondary" disabled={busy} onClick={()=>void resume(h.id)}>{h.status==="COMPLETED"?"Ver resultado":"Continuar conferência"}</button></div>)}</section>
 </div>;
}
