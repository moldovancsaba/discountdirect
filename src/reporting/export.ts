import type { MetricCounters } from "./core";

export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function metricsCsv(rows: Array<{ day: Date | string; counters: MetricCounters }>) {
  const headers = ["day", "campaigns", "offers", "acceptedOffers", "declinedOffers", "deliveries", "sentDeliveries", "failedDeliveries", "suppressedDeliveries", "automationRuns", "failedAutomationRuns", "purchases", "refunds", "revenueHuf"];
  const lines = [headers.join(",")];
  for (const row of rows) lines.push([row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10), ...headers.slice(1).map((key) => row.counters[key as keyof MetricCounters])].map(csvCell).join(","));
  return `${lines.join("\n")}\n`;
}
