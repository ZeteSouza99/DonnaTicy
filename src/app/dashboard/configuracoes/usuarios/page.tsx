"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Loader2, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/client-fetch";
import { DataTable } from "@/components/ui/data-table";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  totalPages: number;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  STORE_MANAGER: "Gerente de Loja",
  SELLER: "Vendedor",
  BUYER: "Comprador",
  WAREHOUSE_OP: "Operador de Depósito",
  FINANCE: "Financeiro",
  MARKETING: "Marketing",
  ECOM_ADMIN: "Admin E-commerce",
  VIEWER: "Visualizador",
};

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: string;
}

const INITIAL_FORM: UserFormData = { name: "", email: "", password: "", role: "SELLER" };

interface UserEditForm {
  name: string;
  role: string;
  isActive: boolean;
}

export default function UsuariosPage(): React.ReactNode {
  const router = useRouter();
  const [users, setUsers] = useState<UsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UserFormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserEditForm>({ name: "", role: "SELLER", isActive: true });
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<UsersResponse>("/api/users?limit=50");
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar usuários.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/users", {
        method: "POST",
        body: form,
      });
      setShowForm(false);
      setForm(INITIAL_FORM);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar usuário.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;
    setBusyId(id);
    try {
      await clientFetch(`/api/users/${id}`, { method: "DELETE" });
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir usuário.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetMfa(u: User): Promise<void> {
    if (!confirm(`Remover o 2FA de ${u.name}? Ele poder? entrar s? com a senha e reativar depois.`)) return;
    setBusyId(u.id);
    setError(null);
    try {
      await clientFetch(`/api/users/${u.id}`, { method: "PUT", body: { resetMfa: true } });
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao resetar o 2FA.");
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(u: User): void {
    setEditingId(u.id);
    setEditForm({ name: u.name, role: u.role, isActive: u.isActive });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/users/${id}`, { method: "PUT", body: editForm });
      setEditingId(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar usuário.");
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    {
      key: "name", label: "Nome",
      render: (u: User) => editingId === u.id ? (
        <input value={editForm.name} disabled={busyId === u.id} className={INPUT_CELL}
          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
      ) : u.name,
    },
    { key: "email", label: "E-mail" },
    {
      key: "role", label: "Papel",
      render: (u: User) => editingId === u.id ? (
        <select value={editForm.role} disabled={busyId === u.id} className={INPUT_CELL}
          onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}>
          {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      ) : ROLE_LABELS[u.role] ?? u.role,
    },
    {
      key: "isActive", label: "Ativo",
      render: (u: User) => editingId === u.id ? (
        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={editForm.isActive} disabled={busyId === u.id}
            onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          {editForm.isActive ? "Sim" : "Não"}
        </label>
      ) : (
        <span className={`text-xs font-semibold ${u.isActive ? "text-green-600" : "text-red-600"}`}>
          {u.isActive ? "Sim" : "Não"}
        </span>
      ),
    },
    {
      key: "createdAt", label: "Criado em",
      render: (u: User) => new Date(u.createdAt).toLocaleDateString("pt-BR"),
    },
    {
      key: "actions", label: "",
      render: (u: User) => {
        const busy = busyId === u.id;
        return editingId === u.id ? (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); handleUpdate(u.id); }} disabled={busy} title="Salvar"
              className="rounded p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} disabled={busy} title="Cancelar"
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); startEditing(u); }} disabled={busy} title="Editar"
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50">
              <Pencil size={16} />
            </button>
            {u.mfaEnabled && (
              <button onClick={(e) => { e.stopPropagation(); handleResetMfa(u); }} disabled={busy} title="Resetar 2FA"
                className="rounded p-1.5 text-amber-600 hover:bg-amber-100 disabled:opacity-50">
                <ShieldOff size={16} />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); handleDelete(u.id); }} disabled={busy} title="Excluir"
              className="rounded p-1.5 text-red-500 hover:bg-red-100 disabled:opacity-50">
              <Trash2 size={16} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/configuracoes")} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> Novo Usuário
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold">Criar Usuário</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
              <input id="name" name="name" required value={form.name} onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">E-mail *</label>
              <input id="email" name="email" type="email" required value={form.email} onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">Senha *</label>
              <input id="password" name="password" type="password" required minLength={8} value={form.password} onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="role" className="mb-1 block text-sm font-medium text-gray-700">Papel *</label>
              <select id="role" name="role" required value={form.role} onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowForm(false); setForm(INITIAL_FORM); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {isSubmitting ? "Criando..." : "Criar"}
            </button>
          </div>
        </form>
      )}

      {isLoading && <LoadingSpinner />}
      {!isLoading && !error && users && users.data.length === 0 && (
        <EmptyState title="Nenhum usuário" description="Crie o primeiro usuário do sistema." />
      )}
      {users && users.data.length > 0 && (
        <DataTable columns={columns} data={users.data} keyExtractor={(u) => u.id} />
      )}
    </div>
  );
}
