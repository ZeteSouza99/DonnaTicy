"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";

interface Customer {
  id: string;
  code: string;
  fullName: string;
  email: string | null;
  phone: string;
  cpf: string | null;
  birthDate: string | null;
  gender: string | null;
  tier: string;
  lifetimeValue: number;
  totalOrders: number;
  loyaltyPoints: number;
  acquisitionChannel: string | null;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  createdAt: string;
}

const GENDERS = [
  { value: "FEMALE", label: "Feminino" },
  { value: "MALE", label: "Masculino" },
  { value: "NON_BINARY", label: "Não-binário" },
  { value: "PREFER_NOT_SAY", label: "Prefiro não dizer" },
];

export default function ClienteDetalhePage(): React.ReactNode {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);

  const fetchCustomer = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<Customer>(`/api/customers/${id}`);
      setCustomer(data);
      setFullName(data.fullName);
      setEmail(data.email ?? "");
      setPhone(data.phone);
      setCpf(data.cpf ?? "");
      setBirthDate(data.birthDate ? data.birthDate.slice(0, 10) : "");
      setGender(data.gender ?? "");
      setWhatsappOptIn(data.whatsappOptIn);
      setEmailOptIn(data.emailOptIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar cliente.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch(`/api/customers/${id}`, {
        method: "PUT",
        body: {
          fullName,
          email: email || undefined,
          phone,
          cpf: cpf || undefined,
          birthDate: birthDate || undefined,
          gender: gender || undefined,
          whatsappOptIn,
          emailOptIn,
        },
      });
      router.push("/dashboard/clientes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar cliente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
    try {
      await clientFetch(`/api/customers/${id}`, { method: "DELETE" });
      router.push("/dashboard/clientes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir cliente.");
    }
  }

  if (isLoading) return <LoadingSpinner />;
  if (error && !customer) return <ErrorMessage message={error} onRetry={fetchCustomer} />;
  if (!customer) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.fullName}</h1>
            <p className="text-sm text-gray-500">Código: {customer.code} · Tier: {customer.tier} · Desde {new Date(customer.createdAt).toLocaleDateString("pt-BR")}</p>
          </div>
        </div>
        <button onClick={handleDelete} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          <Trash2 size={16} /> Excluir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500">Pedidos</p>
          <p className="text-lg font-bold">{customer.totalOrders}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500">LTV</p>
          <p className="text-lg font-bold">{customer.lifetimeValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500">Pontos</p>
          <p className="text-lg font-bold">{customer.loyaltyPoints}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500">Tier</p>
          <p className="text-lg font-bold">{customer.tier}</p>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      <form onSubmit={handleSave} className="space-y-4 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Dados Cadastrais</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-gray-700">Nome Completo *</label>
            <input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">Telefone *</label>
            <input id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="cpf" className="mb-1 block text-sm font-medium text-gray-700">CPF</label>
            <input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="birthDate" className="mb-1 block text-sm font-medium text-gray-700">Data de Nascimento</label>
            <input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="gender" className="mb-1 block text-sm font-medium text-gray-700">Gênero</label>
            <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Selecione</option>
              {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Preferências de Comunicação</p>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              WhatsApp
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={emailOptIn} onChange={(e) => setEmailOptIn(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              E-mail
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            <Save size={16} />
            {isSubmitting ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}
