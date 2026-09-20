export const REPORTING_SCHEMA_VERSION = 1;

export type MetricCounters = {
  campaigns: number; offers: number; acceptedOffers: number; declinedOffers: number;
  deliveries: number; sentDeliveries: number; failedDeliveries: number; suppressedDeliveries: number;
  automationRuns: number; failedAutomationRuns: number; purchases: number; refunds: number; revenueHuf: number;
};

export type MetricFact = { kind: keyof MetricCounters; value?: number };

export function emptyCounters(): MetricCounters {
  return { campaigns: 0, offers: 0, acceptedOffers: 0, declinedOffers: 0, deliveries: 0, sentDeliveries: 0, failedDeliveries: 0, suppressedDeliveries: 0, automationRuns: 0, failedAutomationRuns: 0, purchases: 0, refunds: 0, revenueHuf: 0 };
}

export function reduceMetricFacts(facts: readonly MetricFact[]) {
  return facts.reduce((result, fact) => ({ ...result, [fact.kind]: result[fact.kind] + (fact.value ?? 1) }), emptyCounters());
}

export function utcDay(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_METRIC_DATE");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function projectionIsFresh(computedAt: Date | string, now = new Date(), maxAgeMs = 26 * 60 * 60 * 1000) {
  return now.getTime() - new Date(computedAt).getTime() <= maxAgeMs;
}
