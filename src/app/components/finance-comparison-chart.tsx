import { formatMoney, moneyToCents } from "@/lib/finance/money";

export interface FinanceComparisonItem {
  label: string;
  value: string;
  tone?: "red" | "dark" | "amber" | "green";
}

const toneColors = {
  red: "#b4232c",
  dark: "#5e5651",
  amber: "#d9942e",
  green: "#43886a",
} as const;

export function FinanceComparisonChart({
  items,
  emptyMessage = "Todavía no hay importes para mostrar.",
}: {
  items: FinanceComparisonItem[];
  emptyMessage?: string;
}) {
  const maxAmount = items.reduce((largest, item) => {
    const amount = moneyToCents(item.value);
    return amount > largest ? amount : largest;
  }, BigInt(0));

  return (
    <div aria-label="Comparación de importes" className="comparison-chart">
      {items.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        items.map((item) => {
          const amount = moneyToCents(item.value);
          const width =
            maxAmount === BigInt(0)
              ? 0
              : Number((amount * BigInt(10000)) / maxAmount) / 100;

          return (
            <div className="comparison-chart-row" key={item.label}>
              <div className="comparison-chart-label">
                <span>{item.label}</span>
                <strong>{formatMoney(item.value)}</strong>
              </div>
              <div
                aria-label={`${item.label}: ${formatMoney(item.value)}`}
                className="comparison-chart-track"
                role="img"
              >
                <span
                  className="comparison-chart-value"
                  style={{
                    width: `${width}%`,
                    backgroundColor: toneColors[item.tone ?? "red"],
                  }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
