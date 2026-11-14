"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "./mobile-nav";
import { SessionContext, type SessionUser } from "./session-context";
import { Header } from "@/components/layout/header";

interface DashboardShellProps {
  user: SessionUser;
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps): React.JSX.Element {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  // Fecha o drawer ao navegar (ajuste de estado durante a renderização,
  // evitando o efeito em cascata de um useEffect).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setIsMobileOpen(false);
  }

  // Fecha o drawer com tecla ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setIsMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return (): void => window.removeEventListener("keydown", onKey);
  }, []);

  // Bloqueia scroll do body quando drawer aberto
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return (): void => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  return (
    <SessionContext.Provider value={user}><div className="app-shell flex min-h-screen bg-[var(--background)]">
      <Sidebar role={user.role} isMobileOpen={isMobileOpen} onCloseMobile={() => setIsMobileOpen(false)} />

      {/* Overlay mobile */}
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <Header userName={user.name} role={user.role} onOpenMobileMenu={() => setIsMobileOpen(true)} />
        <main id="main-content" className="app-content flex-1 bg-[var(--background)] p-4 sm:p-6 lg:p-8 print:bg-white print:p-0">
          {children}
        </main>
      </div>
      <MobileNav role={user.role} onMenu={() => setIsMobileOpen(true)} />
    </div></SessionContext.Provider>
  );
}
