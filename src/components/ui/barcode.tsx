"use client";

import { encodeEan13, onlyDigits } from "@/lib/barcode";

interface BarcodeProps {
  /** EAN-13 completo (13 dígitos). */
  value: string;
  /** Largura de cada módulo, em px. */
  moduleWidth?: number;
  /** Altura das barras, em px. */
  height?: number;
  /** Exibe os dígitos abaixo das barras. */
  showValue?: boolean;
  className?: string;
}

/**
 * Renderiza um código de barras EAN-13 em SVG puro (sem dependências).
 * Se o valor for inválido, mostra apenas o texto do código.
 */
export function Barcode({
  value,
  moduleWidth = 2,
  height = 48,
  showValue = true,
  className,
}: BarcodeProps): React.ReactNode {
  const bits = encodeEan13(value);
  const digits = onlyDigits(value);

  if (!bits) {
    return <span className={`font-mono text-xs text-gray-500 ${className ?? ""}`}>{value || "—"}</span>;
  }

  const width = bits.length * moduleWidth;
  const bars: { x: number; width: number }[] = [];
  let index = 0;
  while (index < bits.length) {
    if (bits[index] === "1") {
      let run = 1;
      while (bits[index + run] === "1") run++;
      bars.push({ x: index * moduleWidth, width: run * moduleWidth });
      index += run;
    } else {
      index++;
    }
  }

  const textHeight = showValue ? 14 : 0;

  return (
    <svg
      className={className}
      width={width}
      height={height + textHeight}
      viewBox={`0 0 ${width} ${height + textHeight}`}
      role="img"
      aria-label={`Código de barras ${digits}`}
    >
      <rect x={0} y={0} width={width} height={height + textHeight} fill="#ffffff" />
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={height} fill="#000000" />
      ))}
      {showValue && (
        <text
          x={width / 2}
          y={height + 11}
          textAnchor="middle"
          fontFamily="monospace"
          fontSize={11}
          letterSpacing={1}
          fill="#000000"
        >
          {digits}
        </text>
      )}
    </svg>
  );
}
