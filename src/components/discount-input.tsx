import { NumberInput, Select as GdsSelect } from "@discountdirect/gds-client";
import type { SellerSettings } from "@/settings/validation";

export function DiscountInput({ settings }: { settings: SellerSettings }) {
  const minimum = settings.discount_guardrails.floor_pct;
  const maximum = Math.min(settings.discount_guardrails.max_pct, 100 - settings.discount_guardrails.margin_floor_pct);
  if (settings.discount_mode === "steps") {
    const steps = settings.discount_steps.filter((value) => value >= minimum && value <= maximum);
    return <GdsSelect name="discountPct" label="Kedvezmény" required defaultValue={String(steps[0] ?? minimum)} data={steps.map((value) => ({ value: String(value), label: `${value}%` }))} />;
  }
  return <NumberInput name="discountPct" label="Kedvezmény (%)" required min={minimum} max={maximum} step={1} allowDecimal={false} defaultValue={minimum} />;
}
