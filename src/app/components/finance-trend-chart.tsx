"use client";

import { useState, type PointerEvent } from "react";
import { formatMoney, moneyToCents } from "@/lib/finance/money";
import type {
  FinanceTrendGranularity,
  FinanceTrendPoint,
} from "@/lib/finance/trend";

const chartWidth = 760;
const chartHeight = 284;
const plotLeft = 62;
const plotRight = 744;
const plotTop = 18;
const plotBottom = 224;
const plotHeight = plotBottom - plotTop;
const plotWidth = plotRight - plotLeft;
const series = [
  { key: "salesTotal", label: "Reporte Z neto de cierres", color: "#b4232c" },
  {
    key: "expenseIncurred",
    label: "Gastos (se restan del período)",
    color: "#d9942e",
  },
] as const;

function compactMoney(cents: bigint): string {
  const amount = Number(cents) / 100;
  if (amount >= 1_000_000) {
    return `B/. ${(amount / 1_000_000).toLocaleString("es-PA", {
      maximumFractionDigits: 1,
    })} M`;
  }
  if (amount >= 1_000) {
    return `B/. ${(amount / 1_000).toLocaleString("es-PA", {
      maximumFractionDigits: 1,
    })} k`;
  }
  return `B/. ${amount.toLocaleString("es-PA", {
    minimumFractionDigits: amount < 10 ? 2 : 0,
    maximumFractionDigits: amount < 10 ? 2 : 0,
  })}`;
}

function formatTooltipDate(
  bucket: string,
  granularity: FinanceTrendGranularity,
): string {
  const date =
    granularity === "day"
      ? new Date(`${bucket}T12:00:00Z`)
      : new Date(`${bucket}-01T12:00:00Z`);
  return new Intl.DateTimeFormat("es-PA", {
    day: granularity === "day" ? "numeric" : undefined,
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function xPosition(index: number, count: number): number {
  return count < 2
    ? plotLeft + plotWidth / 2
    : plotLeft + (index * plotWidth) / (count - 1);
}

type SeriesKey = (typeof series)[number]["key"];

function formatAmountAt(bucket: FinanceTrendPoint, key: SeriesKey): string {
  return formatMoney(bucket[key]);
}

export function FinanceTrendChart({
  granularity,
  points,
}: {
  granularity: FinanceTrendGranularity;
  points: FinanceTrendPoint[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maxAmount = points.reduce(
    (max, point) =>
      series.reduce((largest, item) => {
        const amount = moneyToCents(point[item.key]);
        return amount > largest ? amount : largest;
      }, max),
    BigInt(0),
  );
  const chartMax =
    maxAmount < BigInt(100) ? BigInt(100) : maxAmount;
  const hasData = maxAmount > BigInt(0);
  const tickIndexes = new Set<number>([0, points.length - 1]);
  const tickStep = Math.max(1, Math.ceil((points.length - 1) / 5));

  for (let index = tickStep; index < points.length - 1; index += tickStep) {
    tickIndexes.add(index);
  }

  const activePoint =
    activeIndex === null ? null : points[activeIndex] ?? null;
  const activeX =
    activeIndex === null ? null : xPosition(activeIndex, points.length);

  function pointIndexFromPointer(
    event: PointerEvent<SVGSVGElement>,
  ): number | null {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * chartWidth;
    const y = ((event.clientY - bounds.top) / bounds.height) * chartHeight;

    if (
      x < plotLeft ||
      x > plotRight ||
      y < plotTop ||
      y > plotBottom ||
      points.length === 0
    ) {
      return null;
    }

    return points.length < 2
      ? 0
      : Math.max(
          0,
          Math.min(
            points.length - 1,
            Math.round(((x - plotLeft) / plotWidth) * (points.length - 1)),
          ),
        );
  }

  return (
    <div className="finance-trend-chart">
      {!hasData ? (
        <p className="chart-empty-state">
          No hay movimientos registrados para mostrar en este período.
        </p>
      ) : null}
      <svg
        aria-label={`Tendencia financiera ${
          granularity === "day" ? "diaria" : "mensual"
        }`}
        aria-describedby="finance-trend-help"
        className="finance-trend-svg"
        onBlur={() => setActiveIndex(null)}
        onFocus={() => {
          if (hasData) {
            setActiveIndex((current) => current ?? 0);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setActiveIndex(null);
          } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) =>
              Math.min(points.length - 1, (current ?? -1) + 1),
            );
          } else if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowDown"
          ) {
            event.preventDefault();
            setActiveIndex((current) =>
              Math.max(0, (current ?? points.length) - 1),
            );
          } else if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setActiveIndex(points.length - 1);
          }
        }}
        onPointerDown={(event) => {
          const index = pointIndexFromPointer(event);
          if (index !== null) {
            setActiveIndex(index);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") {
            setActiveIndex(null);
          }
        }}
        onPointerMove={(event) => {
          const index = pointIndexFromPointer(event);
          setActiveIndex((current) =>
            current === index ? current : index,
          );
        }}
        role="group"
        tabIndex={hasData ? 0 : -1}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <title>
          Tendencia de Reporte Z neto y gastos del período seleccionado
        </title>
        <desc>
          Compara Reporte Z neto de los cierres y gastos por fecha del gasto,
          por{" "}
          {granularity === "day" ? "día" : "mes"}.
        </desc>
        {[0, 1, 2, 3, 4].map((step) => {
          const value = (chartMax * BigInt(step)) / BigInt(4);
          const y = plotBottom - (plotHeight * step) / 4;
          return (
            <g key={step}>
              <line
                className="finance-chart-gridline"
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
              />
              <text
                className="finance-chart-axis-label"
                textAnchor="end"
                x={plotLeft - 10}
                y={y + 4}
              >
                {compactMoney(value)}
              </text>
            </g>
          );
        })}
        {activeX !== null ? (
          <line
            className="finance-chart-crosshair"
            x1={activeX}
            x2={activeX}
            y1={plotTop}
            y2={plotBottom}
          />
        ) : null}
        {series.map((item) => {
          const coordinates = points.map((point, index) => {
            const amount = moneyToCents(point[item.key]);
            const scaled = Number((amount * BigInt(10000)) / chartMax) / 10000;
            return {
              x: xPosition(index, points.length),
              y: plotBottom - scaled * plotHeight,
              point,
            };
          });
          const path = coordinates
            .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x},${y}`)
            .join(" ");

          return (
            <g key={item.key}>
              <path
                className="finance-chart-line"
                d={path}
                style={{ stroke: item.color }}
              />
              <path
                className="finance-chart-hit-line"
                d={path}
                style={{ stroke: item.color }}
              />
              {coordinates.map(({ x, y, point }, index) => {
                const isActive = activeIndex === index;
                return (
                  <circle
                    className={`finance-chart-point${
                      isActive ? " is-active" : ""
                    }`}
                    cx={x}
                    cy={y}
                    key={point.bucket}
                    r={isActive ? "5.5" : "2.5"}
                    style={{ stroke: item.color }}
                  />
                );
              })}
            </g>
          );
        })}
        {Array.from(tickIndexes)
          .sort((a, b) => a - b)
          .map((index) => (
            <text
              className="finance-chart-axis-label"
              key={points[index]?.bucket ?? index}
              textAnchor={
                index === 0
                  ? "start"
                  : index === points.length - 1
                    ? "end"
                    : "middle"
              }
              x={xPosition(index, points.length)}
              y={plotBottom + 23}
            >
              {points[index]?.label}
            </text>
          ))}
      </svg>
      {activePoint && activeX !== null ? (
        <div
          aria-live="polite"
          className="finance-chart-tooltip"
          role="status"
          style={{
            left: `min(max(130px, ${(activeX / chartWidth) * 100}%), calc(100% - 130px))`,
          }}
        >
          <strong className="finance-chart-tooltip-date">
            {formatTooltipDate(activePoint.bucket, granularity)}
          </strong>
          {series.map((item) => (
            <div className="finance-chart-tooltip-row" key={item.key}>
              <span>
                <i
                  aria-hidden="true"
                  className="finance-chart-tooltip-marker"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
              <strong>{formatAmountAt(activePoint, item.key)}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <p className="finance-chart-help" id="finance-trend-help">
        Pasa el cursor o toca el gráfico para consultar los valores. Con el
        teclado, usa las flechas para recorrer los períodos. Los gastos se
        restan del saldo del período, no de los cierres diarios.
      </p>
      <ul aria-label="Series del gráfico" className="finance-trend-legend">
        {series.map((item) => (
          <li key={item.key}>
            <span
              aria-hidden="true"
              className="finance-legend-marker"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
