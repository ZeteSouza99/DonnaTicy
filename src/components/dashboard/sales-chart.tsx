"use client";
import { useId } from "react";
import { formatBRL } from "@/lib/format";
export function SalesChart({ points }: { points: Array<{ day: string; total: number }> }) {
  const id = useId().replace(/:/g, "");
  if (!points.length) return <div className="flex h-56 items-center justify-center text-sm text-gray-500">As vendas confirmadas aparecerão aqui.</div>;
  const width = 720, height = 200, max = Math.max(...points.map((p) => p.total), 1);
  const coords = points.map((p, i) => [20 + i * (width - 40) / Math.max(1, points.length - 1), 175 - p.total / max * 145]);
  const line = coords.map(([x,y]) => `${x},${y}`).join(" ");
  return <div><svg viewBox={`0 0 ${width} ${height}`} className="sales-chart mt-5 h-56 w-full" role="img" aria-label="Evolução diária das vendas confirmadas">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#84933d" stopOpacity=".22" /><stop offset="100%" stopColor="#84933d" stopOpacity=".01" /></linearGradient></defs>
    {[30,78,126,175].map((y) => <line key={y} x1="20" x2="700" y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 6" />)}
    <polygon points={`20,175 ${line} ${coords.at(-1)?.[0]},175`} fill={`url(#${id})`} />
    <polyline points={line} fill="none" stroke="#68762c" strokeWidth="3" strokeLinejoin="round" />
    {coords.map(([x,y],i) => <circle key={points[i].day} cx={x} cy={y} r={points.length > 45 ? 2 : 4} fill="#68762c" stroke="white" strokeWidth="2"><title>{points[i].day.split("-").reverse().join("/")}: {formatBRL(points[i].total)}</title></circle>)}
  </svg><div className="flex justify-between text-xs text-gray-500"><span>{points[0].day.split("-").reverse().join("/")}</span><span>Pico diário: {formatBRL(Math.max(...points.map(p => p.total), 0))}</span><span>{points.at(-1)!.day.split("-").reverse().join("/")}</span></div>
  <details className="mt-4 text-xs text-gray-500"><summary className="cursor-pointer">Ver valores por dia</summary><div className="mt-3 max-h-48 overflow-y-auto">{points.map((p) => <div key={p.day} className="flex justify-between border-b py-2"><span>{p.day.split("-").reverse().join("/")}</span><span>{formatBRL(p.total)}</span></div>)}</div></details></div>;
}
