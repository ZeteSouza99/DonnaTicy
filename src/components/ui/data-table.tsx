"use client";

import { ReactNode } from "react";

interface Column<T> {
  key: string;
  label: ReactNode;
  render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({ columns, data, keyExtractor, onRowClick }: DataTableProps<T>): ReactNode {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 max-sm:border-0">
      <table className="responsive-table min-w-full divide-y divide-gray-200">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              className={onRowClick ? "cursor-pointer hover:bg-gray-50 transition-colors" : ""}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={(e) => { if (onRowClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onRowClick(item); } }}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td key={col.key} data-label={typeof col.label === "string" ? col.label : col.key} className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {col.render
                    ? col.render(item)
                    : String((item as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
