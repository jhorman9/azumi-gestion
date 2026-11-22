import { formatMoney, moneyToCents } from "@/lib/finance/money";

export interface FinanceBarItem {
  label: string;
  value: string;
  tone?: "red" | "dark" | "amber" | "green";
}

export function FinanceBarChart({
  items,
  emptyMessage = "Todavía no hay importes para mostrar.",
}: {
  items: FinanceBarItem[];
  emptyMessage?: string;
}) {
  const maxAmount = items.reduce((largest, item) => {
    const amount = moneyToCents(item.value);
    return amount > largest ? amount : largest;
  }, BigInt(0));

  return (
    <div aria-label="Gráfico de importes" className="finance-bar-chart">
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
            <div className="finance-bar-row" key={item.label}>
              <div className="finance-bar-label">
                <span>{item.label}</span>
                <strong>{formatMoney(item.value)}</strong>
              </div>
              <div
                aria-label={`${item.label}: ${formatMoney(item.value)}`}
                className="finance-bar-track"
                role="img"
              >
                <span
                  className={`finance-bar-fill finance-bar-${item.tone ?? "red"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
