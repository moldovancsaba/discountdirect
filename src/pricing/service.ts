import "server-only";
import { BuyerRelationship } from "@/auth/models";
import { SellerSettingsModel } from "@/settings/models";
import { validateSellerSettings } from "@/settings/validation";
import { decideDiscount } from "./guardrails";

export async function discountDecision(sellerId: string, buyerUserId: string, discountPct: unknown) {
  const [stored, relationship] = await Promise.all([
    SellerSettingsModel.findOne({ sellerId }).lean(),
    BuyerRelationship.findOne({ sellerId, buyerUserId, status: "active" }).lean(),
  ]);
  const settings = validateSellerSettings(stored?.settings ?? {});
  return decideDiscount(settings, relationship?.segment ?? "new", discountPct);
}
