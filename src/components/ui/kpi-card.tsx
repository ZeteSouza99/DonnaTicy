import { TrendingDown, TrendingUp } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: React.ReactNode;
  color?: "brand" | "green" | "blue" | "orange" | "red";
}

const colorMap = {
  brand: {
    iconBg: "bg-brand-500/10",
    iconText: "text-brand-600",
    trendPositive: "text-brand-600 bg-brand-50",
    borderGlow: "group-hover:border-brand-500/30",
  },
  green: {
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-600",
    trendPositive: "text-emerald-600 bg-emerald-50",
    borderGlow: "group-hover:border-emerald-500/30",
  },
  blue: {
    iconBg: "bg-blue-500/10",
    iconText: "text-blue-600",
    trendPositive: "text-blue-600 bg-blue-50",
    borderGlow: "group-hover:border-blue-500/30",
  },
  orange: {
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-600",
    trendPositive: "text-amber-600 bg-amber-50",
    borderGlow: "group-hover:border-amber-500/30",
  },
  red: {
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-600",
    trendPositive: "text-rose-600 bg-rose-50",
    borderGlow: "group-hover:border-rose-500/30",
  },
};

export function KpiCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  color = "brand",
}: KpiCardProps): React.JSX.Element {
  const palette = colorMap[color];

  return (
    <div className={`group relative overflow-hidden rounded-2xl bg-white p-6 shadow-[var(--shadow-premium)] transition-[box-shadow,border-color] duration-200 hover:shadow-[var(--shadow-premium-hover)] border border-transparent ${palette.borderGlow}`}>
      {/* Background subtile glow for premium effect */}
      <div className={`absolute -right-6 -top-6 h-28 w-28 rounded-full blur-3xl opacity-20 transition-opacity duration-300 group-hover:opacity-40 ${palette.iconBg.replace('/10', '')}`} />

      {/* Icon */}
      <div className={`mb-5 inline-flex rounded-xl p-3 ring-1 ring-inset ring-black/5 ${palette.iconBg} ${palette.iconText}`}>
        {icon}
      </div>

      {/* Title */}
      <div className="relative z-10">
        <p className="text-[12.5px] font-bold tracking-wider text-gray-400/80 uppercase">{title}</p>
        
        {/* Value */}
        <p className="mt-1.5 text-[28px] font-extrabold tracking-tight text-gray-900">{value}</p>

        {/* Trend + Subtitle */}
        <div className="mt-4 flex items-center gap-2">
          {trend !== undefined && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-bold ${
                trend >= 0 ? palette.trendPositive : "bg-rose-50 text-rose-600"
              }`}
            >
              {trend >= 0 ? (
                <TrendingUp className="h-[14px] w-[14px]" />
              ) : (
                <TrendingDown className="h-[14px] w-[14px]" />
              )}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {subtitle && <span className="text-[12.5px] font-medium text-gray-400">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}
