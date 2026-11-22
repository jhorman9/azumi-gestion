import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: "red" | "green" | "amber" | "blue" | "violet";
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "red",
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <div className="metric-card-heading">
        <h2>{label}</h2>
        <span aria-hidden="true" className="metric-icon">
          <Icon size={19} strokeWidth={1.9} />
        </span>
      </div>
      <p>{value}</p>
      <span className="metric-hint">{hint}</span>
    </article>
  );
}
