"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const themeEvent = "donnaticy-theme-change";
function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}
function serverSnapshot(): boolean { return false; }
function storedTheme(): string | null {
  try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
}
function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    const saved = storedTheme();
    document.documentElement.dataset.theme = saved === "dark" || saved === "light"
      ? saved : media.matches ? "dark" : "light";
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) sync();
  };
  window.addEventListener(themeEvent, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", sync);
  return () => {
    window.removeEventListener(themeEvent, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", sync);
  };
}

export function ThemeToggle(): React.JSX.Element {
  const dark = useSyncExternalStore(subscribe, isDark, serverSnapshot);
  const label = dark ? "Ativar tema claro" : "Ativar tema escuro";
  function toggle(): void {
    const theme = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Mantém a troca nesta página. */ }
    window.dispatchEvent(new Event(themeEvent));
  }
  return (
    <button type="button" onClick={toggle} className="theme-toggle print:hidden" aria-label={label} title={label}>
      <Moon className="theme-moon h-5 w-5" aria-hidden="true" />
      <Sun className="theme-sun h-5 w-5" aria-hidden="true" />
    </button>
  );
}
