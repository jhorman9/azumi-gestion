import { formatMoney, moneyToCents, subtractMoney } from "@/lib/finance/money";

const radius = 62;
const circumference = 2 * Math.PI * radius;

export function PayablesDonutChart({
  outstanding,
  overdue,
}: {
  outstanding: string;
  overdue: string;
}) {
  const current = subtractMoney(outstanding, overdue);

  if (current === null) {
    throw new Error("Overdue payables cannot exceed outstanding payables.");
  }

  const totalCents = moneyToCents(outstanding);
  const overdueCents = moneyToCents(overdue);
  const overdueRatio =
    totalCents === BigInt(0)
      ? 0
      : Number((overdueCents * BigInt(10000)) / totalCents) / 10000;
  const overduePercent = Math.round(overdueRatio * 100);
  const overdueLength = circumference * overdueRatio;

  return (
    <div className="payables-chart">
      <svg
        aria-label={`Cuentas por pagar: ${formatMoney(current)} al día y ${formatMoney(
          overdue,
        )} vencidas`}
        className="payables-donut"
        role="img"
        viewBox="0 0 180 180"
      >
        <title>Estado actual de las cuentas por pagar</title>
        <circle
          className="payables-donut-track"
          cx="90"
          cy="90"
          r={radius}
        />
        {overdueCents > BigInt(0) ? (
          <circle
            className="payables-donut-overdue"
            cx="90"
            cy="90"
            r={radius}
            strokeDasharray={`${overdueLength} ${circumference}`}
            transform="rotate(-90 90 90)"
          />
        ) : null}
        <text className="payables-donut-caption" textAnchor="middle" x="90" y="82">
          TOTAL PENDIENTE
        </text>
        <text className="payables-donut-total" textAnchor="middle" x="90" y="105">
          {formatMoney(outstanding)}
        </text>
      </svg>
      <ul className="payables-legend">
        <li>
          <span aria-hidden="true" className="payables-legend-marker is-current" />
          <span>Al día</span>
          <strong>{formatMoney(current)}</strong>
        </li>
        <li>
          <span aria-hidden="true" className="payables-legend-marker is-overdue" />
          <span>Vencido ({overduePercent}%)</span>
          <strong>{formatMoney(overdue)}</strong>
        </li>
      </ul>
    </div>
  );
}
