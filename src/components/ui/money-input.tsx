"use client";

import { forwardRef, useMemo } from "react";

/**
 * MoneyInput — campo de entrada monetária pt-BR (R$).
 *
 * Comportamento:
 * - O usuário só digita números; cada dígito vai para a casa dos centavos.
 * - Visualização sempre formatada como "R$ 1.234,56".
 * - O valor emitido em `onChange` é uma string decimal padrão (ex.: "1234.56"),
 *   compatível com `Number(value)` usado nos formulários existentes.
 */

interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string | number;
  onChange: (value: string) => void;
}

const formatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toCents(raw: string | number): number {
  if (raw === "" || raw === null || raw === undefined) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, className = "", ...rest },
  ref,
) {
  const cents = useMemo(() => toCents(value), [value]);
  const display = formatter.format(cents / 100);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const digits = e.target.value.replace(/\D/g, "");
    const newCents = digits === "" ? 0 : Number(digits);
    onChange(centsToDecimalString(newCents));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const next = Math.floor(cents / 10);
      onChange(centsToDecimalString(next));
    }
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={className}
      {...rest}
    />
  );
});
