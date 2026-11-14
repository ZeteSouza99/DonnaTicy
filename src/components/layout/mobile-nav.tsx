"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ShoppingBag, Package, Users, Menu } from "lucide-react";
import { can } from "@/lib/permissions";
export function MobileNav({ role, onMenu }: { role: string; onMenu: () => void }) {
  const path = usePathname();
  const items = [
    { href: "/dashboard", label: "Início", icon: House, show: true },
    { href: "/dashboard/catalogo", label: "Produtos", icon: Package, show: can(role, "catalog", "read") },
    { href: "/dashboard/vendas", label: "Vender", icon: ShoppingBag, show: can(role, "orders", "write") },
    { href: "/dashboard/clientes", label: "Clientes", icon: Users, show: can(role, "customers", "read") },
  ].filter((item) => item.show);
  return <nav aria-label="Navegação principal no celular" className="mobile-nav">
    {items.map(({ href, label, icon: Icon }) => { const active = href === "/dashboard" ? path === href : path.startsWith(href);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}><span className={label === "Vender" ? "mobile-nav-sale" : ""}><Icon size={21} strokeWidth={active ? 2.3 : 1.8} /></span><span>{label}</span></Link>;
    })}
    <button type="button" onClick={onMenu} aria-label="Abrir todos os módulos"><span><Menu size={21} /></span><span>Mais</span></button>
  </nav>;
}
