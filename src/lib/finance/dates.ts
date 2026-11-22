export interface DateRange {
  start: string;
  end: string;
}

function isValidBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function requireBusinessDate(value: string): string {
  if (!isValidBusinessDate(value)) {
    throw new Error("Invalid business date.");
  }

  return value;
}

export function todayInPanama(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Panama",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatDateTimeInPanama(value: string | null): string {
  if (!value) {
    return "—";
  }

  const timestamp = value.endsWith("Z")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export function currentMonthInPanama(now = new Date()): DateRange {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Panama",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((item) => item.type === "year")?.value);
  const month = Number(parts.find((item) => item.type === "month")?.value);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

export function nextBusinessDate(value: string): string {
  requireBusinessDate(value);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function businessDateTimeUtc(value: string): string {
  requireBusinessDate(value);
  return new Date(`${value}T00:00:00-05:00`)
    .toISOString()
    .slice(0, 23)
    .replace("T", " ");
}

export function businessRangeUtc(start: string, end: string): {
  startUtc: string;
  endUtcExclusive: string;
} {
  const validStart = requireBusinessDate(start);
  const validEnd = requireBusinessDate(end);

  if (validStart > validEnd) {
    throw new Error("Date range start must not be after end.");
  }

  return {
    startUtc: businessDateTimeUtc(validStart),
    endUtcExclusive: businessDateTimeUtc(nextBusinessDate(validEnd)),
  };
}
