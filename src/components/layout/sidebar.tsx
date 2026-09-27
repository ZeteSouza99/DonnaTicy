"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  DollarSign,
  Factory,
  Heart,
  BarChart3,
  Settings,
  Warehouse,
  Barcode,
  LogOut,
  ChevronLeft,
  ChevronRight,
  FileText,
  X
} from "lucide-react";
import { brand } from "@/lib/brand";
import { can, type Resource } from "@/lib/permissions";

interface SidebarProps {
  role: string;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Recurso na matriz de permissões; o item aparece se o papel tiver leitura. */
  resource: Resource;
}

const navGroups: NavGroup[] = [
  {
    title: "Comercial",
    items: [
      { label: "Catálogo", href: "/dashboard/catalogo", icon: Package, resource: "catalog" },
      { label: "Etiquetas", href: "/dashboard/catalogo/etiquetas", icon: Barcode, resource: "catalog" },
      { label: "Vendas", href: "/dashboard/vendas", icon: ShoppingCart, resource: "orders" },
      { label: "Clientes", href: "/dashboard/clientes", icon: Users, resource: "customers" },
    ],
  },
  {
    title: "Operações",
    items: [
      { label: "Estoque", href: "/dashboard/estoque", icon: Warehouse, resource: "inventory" },
      { label: "Compras", href: "/dashboard/compras", icon: Factory, resource: "purchasing" },
      { label: "Entradas", href: "/dashboard/notas-fiscais", icon: FileText, resource: "invoices" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { label: "Financeiro", href: "/dashboard/financeiro", icon: DollarSign, resource: "financial" },
      { label: "CRM", href: "/dashboard/crm", icon: Heart, resource: "crm" },
      { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3, resource: "reports" },
    ],
  },
];

export function Sidebar({ role, isMobileOpen = false, onCloseMobile }: SidebarProps): React.JSX.Element {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => can(role, i.resource, "read")),
    }))
    .filter((g) => g.items.length > 0);

  // Item ativo = rota exata ou o prefixo mais específico (ex.: /catalogo/etiquetas
  // não deve acender também o item /catalogo).
  const activeHref = navGroups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  // Em mobile sempre mostrar labels (forçar expandido visualmente).
  // Ajuste durante a renderização em vez de efeito, para não encadear renders.
  const [wasMobileOpen, setWasMobileOpen] = useState(isMobileOpen);
  if (wasMobileOpen !== isMobileOpen) {
    setWasMobileOpen(isMobileOpen);
    if (isMobileOpen) setIsCollapsed(false);
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-gray-200/60 bg-white/95 backdrop-blur-xl transition-transform duration-300 ease-in-out md:sticky md:top-0 md:z-40 md:translate-x-0 md:bg-white/80 md:transition-[width] ${
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      } ${isCollapsed ? "md:w-[90px]" : "md:w-[260px]"} w-[280px] print:hidden`}
    >
      {/* Botão fechar (mobile only) */}
      <button
        type="button"
        onClick={onCloseMobile}
        className="absolute right-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 md:hidden"
        aria-label="Fechar menu"
      >
        <X size={18} />
      </button>

      {/* Collapse Toggle (desktop only) */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3.5 top-8 z-50 hidden h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition-colors hover:text-brand-600 focus:outline-none md:flex"
        aria-label={isCollapsed ? "Expandir menu" : "Esconder menu"}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Logo */}
      <div className={`flex shrink-0 items-center justify-center px-4 transition-[height] duration-300 ease-in-out ${isCollapsed ? "h-24 pt-4" : "h-40 pt-6 pb-2"}`}>
        <Link href="/dashboard" className={`flex w-full items-center justify-center transition-opacity hover:opacity-90 ${isCollapsed ? "" : "pr-6"}`}>
          {!isCollapsed ? (
            <Image 
              src={brand.logo} 
              alt={brand.name} 
              width={240} 
              height={128} 
              className="h-32 w-auto object-contain transition-transform duration-300"
              priority 
            />
          ) : (
            <Image
              src={brand.logo}
              alt={brand.name}
              width={240}
              height={128}
              className="h-11 w-11 object-contain"
              priority
            />
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className={`group relative flex items-center justify-center rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all duration-200 ${
              pathname === "/dashboard"
                ? "bg-brand-50 text-brand-600 shadow-sm shadow-brand-100"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title={isCollapsed ? "Dashboard" : undefined}
          >
            <div className={`flex items-center ${isCollapsed ? "" : "gap-3"}`}>
              <LayoutDashboard className={`h-[18px] w-[18px] transition-colors ${pathname === "/dashboard" ? "text-brand-600" : "text-gray-400 group-hover:text-gray-600"}`} />
              {!isCollapsed && <span>Dashboard</span>}
            </div>
            {pathname === "/dashboard" && <div className={`absolute ${isCollapsed ? "right-2" : "right-4"} h-1.5 w-1.5 rounded-full bg-brand-500`} />}
          </Link>
        </div>

        {visibleGroups.map((group, index) => (
          <div key={group.title} className={index === 0 ? "mt-8" : "mt-6"}>
            {!isCollapsed ? (
              <h3 className="mb-3 px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400/80 transition-opacity duration-300">
                {group.title}
              </h3>
            ) : (
              <div className="mx-auto mb-4 h-px w-8 bg-gray-200" />
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = activeHref === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.label : undefined}
                    className={`group relative flex items-center justify-center rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all duration-200 ${
                      isActive
                        ? "bg-brand-50 text-brand-600 shadow-sm shadow-brand-100"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <div className={`flex items-center ${isCollapsed ? "" : "gap-3"}`}>
                      <item.icon className={`h-[18px] w-[18px] transition-colors ${isActive ? "text-brand-600" : "text-gray-400 group-hover:text-gray-600"}`} />
                      {!isCollapsed && <span>{item.label}</span>}
                    </div>
                    {isActive && <div className={`absolute ${isCollapsed ? "right-2" : "right-4"} h-1.5 w-1.5 rounded-full bg-brand-500`} />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / User actions */}
      <div className="mt-auto shrink-0 border-t border-gray-100 p-4">
        <div className="space-y-1">
          {role !== "SELLER" && (
          <Link
            href="/dashboard/configuracoes"
            title={isCollapsed ? "Configurações" : undefined}
            className={`group flex items-center justify-center rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all duration-200 ${
              pathname.startsWith("/dashboard/configuracoes")
                ? "bg-brand-50 text-brand-600 shadow-sm shadow-brand-100"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <div className={`flex items-center ${isCollapsed ? "" : "gap-3"}`}>
              <Settings className={`h-[18px] w-[18px] transition-colors ${pathname.startsWith("/dashboard/configuracoes") ? "text-brand-600" : "text-gray-400 group-hover:text-gray-600"}`} />
              {!isCollapsed && <span className="text-[14px]">Configurações</span>}
            </div>
          </Link>
          )}
          <button
            type="button"
            title={isCollapsed ? "Sair" : undefined}
            className="group flex w-full items-center justify-center rounded-xl px-3 py-2.5 font-semibold text-gray-500 transition-all duration-200 hover:bg-rose-50 hover:text-rose-600"
            onClick={() => {
              fetch("/api/auth/logout", { method: "POST" }).then(() => {
                window.location.href = "/login";
              });
            }}
          >
            <div className={`flex items-center ${isCollapsed ? "" : "gap-3"}`}>
              <LogOut className="h-[18px] w-[18px] text-gray-400 transition-colors group-hover:text-rose-500" />
              {!isCollapsed && <span className="text-[14px]">Sair do sistema</span>}
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
}
