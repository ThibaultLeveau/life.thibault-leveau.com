export function isHyrox(name: string): boolean {
  return name.toLowerCase().includes("hyrox");
}

export function localDay(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Compare civil dates, not elapsed local hours: daylight saving days can be 23/25h.
export function daysUntil(date: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const days = (Date.parse(date) - Date.parse(today)) / 86_400_000;
  return Number.isFinite(days) ? Math.round(days) : null;
}
