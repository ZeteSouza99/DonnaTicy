"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { ErrorMessage } from "@/components/ui/feedback";

const SUPPLIER_TYPES = [
  { value: "FABRIC_SUPPLIER", label: "Fornecedor de Tecido" },
  { value: "TRIM_SUPPLIER", label: "Fornecedor de Aviamentos" },
  { value: "CMT_FACTORY", label: "Confecção (CMT)" },
  { value: "FULL_PACKAGE", label: "Full Package" },
];

export default function NovoFornecedorPage(): React.ReactNode {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [type, setType] = useState("FABRIC_SUPPLIER");
  const [cnpj, setCnpj] = useState("");
  const [stateReg, setStateReg] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [emailField, setEmailField] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/purchasing/suppliers", {
        method: "POST",
        body: {
          companyName,
          tradeName: tradeName || undefined,
          type,
          cnpj,
          stateReg: stateReg || undefined,
          contactName: contactName || undefined,
          phone: phone || undefined,
          email: emailField || undefined,
          paymentTerms: paymentTerms || undefined,
        },
      });
      router.push("/dashboard/compras");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar fornecedor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Novo Fornecedor</h1>
      </div>

      {error && <ErrorMessage message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="companyName" className="mb-1 block text-sm font-medium text-gray-700">Razão Social *</label>
            <input id="companyName" required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="tradeName" className="mb-1 block text-sm font-medium text-gray-700">Nome Fantasia</label>
            <input id="tradeName" value={tradeName} onChange={(e) => setTradeName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="type" className="mb-1 block text-sm font-medium text-gray-700">Tipo *</label>
            <select id="type" required value={type} onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              {SUPPLIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cnpj" className="mb-1 block text-sm font-medium text-gray-700">CNPJ * (14 dígitos)</label>
            <input id="cnpj" required value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Apenas números"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="stateReg" className="mb-1 block text-sm font-medium text-gray-700">Inscrição Estadual</label>
            <input id="stateReg" value={stateReg} onChange={(e) => setStateReg(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="contactName" className="mb-1 block text-sm font-medium text-gray-700">Contato</label>
            <input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">Telefone</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
            <input id="email" type="email" value={emailField} onChange={(e) => setEmailField(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="paymentTerms" className="mb-1 block text-sm font-medium text-gray-700">Condições de Pagamento</label>
            <input id="paymentTerms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Ex: 30/60/90"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {isSubmitting ? "Salvando..." : "Criar Fornecedor"}
          </button>
        </div>
      </form>
    </div>
  );
}
