import { MAX_LABEL_COPIES } from "@/lib/label-copies";

export interface LabelCopiesItem {
  key: string;
  title: string;
  sku: string;
  hint?: string;
  copies: number;
}

/** Ajuste de cópias por variante; fica fora da impressão. */
export function LabelCopiesList({
  items,
  onChange,
}: {
  items: LabelCopiesItem[];
  onChange: (key: string, copies: number) => void;
}): React.ReactNode {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border bg-white print:hidden">
      {items.map((item) => (
        <li key={item.key} className={`flex items-center gap-3 px-3 py-2 text-sm ${item.copies === 0 ? "opacity-50" : ""}`}>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-gray-900">{item.title}</span>
            <span className="block truncate text-xs text-gray-500">
              <span className="font-mono">{item.sku}</span>
              {item.hint && ` · ${item.hint}`}
            </span>
          </span>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            Cópias
            <input
              type="number"
              min={0}
              max={MAX_LABEL_COPIES}
              value={item.copies}
              onChange={(e) => onChange(item.key, Number(e.target.value))}
              className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              aria-label={`Cópias de ${item.sku}`}
            />
          </label>
        </li>
      ))}
    </ul>
  );
}
