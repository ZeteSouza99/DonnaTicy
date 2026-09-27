"use client";

import Link from "next/link";
import { BarChart3, FileText, Calendar, Package, Users, Truck, DollarSign } from "lucide-react";

interface Report {
  href: string;
  icon: typeof BarChart3;
  title: string;
  description: string;
  color: string;
}

const reports: Report[] = [
  {
    href: "/dashboard/relatorios/catalogo",
    icon: Package,
    title: "Catálogo Completo",
    description: "Todos os produtos com variantes, preços, custos, margem e estoque agregado.",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    href: "/dashboard/relatorios/estoque",
    icon: BarChart3,
    title: "Estoque Detalhado",
    description: "Posições de estoque por SKU × local, valor a custo e a varejo, alertas.",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    href: "/dashboard/relatorios/vendas",
    icon: DollarSign,
    title: "Vendas por Período",
    description: "Pedidos com itens, pagamentos, ticket médio, margem por canal e status.",
    color: "bg-gold-100 text-gold-700",
  },
  {
    href: "/dashboard/relatorios/financeiro",
    icon: FileText,
    title: "DRE Gerencial",
    description: "Receitas, CMV, impostos, taxas e despesas com agregação por centro de custo.",
    color: "bg-amber-100 text-amber-700",
  },
  {
    href: "/dashboard/relatorios/abc",
    icon: BarChart3,
    title: "Curva ABC",
    description: "Classificação A/B/C por receita acumulada (80/15/5) com margem por produto.",
    color: "bg-purple-100 text-purple-700",
  },
  {
    href: "/dashboard/relatorios/clientes",
    icon: Users,
    title: "Análise de Clientes",
    description: "LTV, ticket médio, tier, churn risk e dias desde a última compra.",
    color: "bg-blue-100 text-blue-700",
  },
  {
    href: "/dashboard/relatorios/fornecedores",
    icon: Truck,
    title: "Performance de Fornecedores",
    description: "Pedidos, valor gasto, score de qualidade/entrega e materiais por fornecedor.",
    color: "bg-orange-100 text-orange-700",
  },
];

export default function RelatoriosPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="text-brand-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-sm text-gray-500">
            Dados agregados em tempo real a partir do banco de dados.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group flex flex-col items-start gap-3 rounded-lg border bg-white p-5 transition-all hover:border-brand-300 hover:shadow-md"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${r.color}`}>
              <r.icon size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 group-hover:text-brand-700">{r.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{r.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
