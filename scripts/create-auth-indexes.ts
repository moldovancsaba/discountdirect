import mongoose from "mongoose";
import { authModels } from "../src/auth/models.ts";
import { catalogModels } from "../src/catalog/models.ts";
import { purchaseModels } from "../src/purchases/models.ts";
import { privacyModels } from "../src/privacy/models.ts";
import { recommendationModels } from "../src/recommendations/models.ts";
import { messagingModels } from "../src/messaging/models.ts";
import { realtimeModels } from "../src/realtime/models.ts";
import { offerModels } from "../src/offers/models.ts";
import { campaignModels } from "../src/campaigns/models.ts";
import { deliveryModels } from "../src/delivery/models.ts";
import { automationModels } from "../src/automations/models.ts";
import { redemptionModels } from "../src/redemptions/models.ts";

const uri = process.env.MONGODB_URI;
if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri))
  throw new Error("MONGODB_URI is missing or invalid");
await mongoose.connect(uri, {
  dbName: process.env.MONGODB_DB || "discountdirect",
  serverSelectionTimeoutMS: 5000,
  autoIndex: false,
});
try {
  for (const dataModel of [...authModels, ...catalogModels, ...purchaseModels, ...privacyModels, ...recommendationModels, ...messagingModels, ...realtimeModels, ...offerModels, ...campaignModels, ...deliveryModels, ...automationModels, ...redemptionModels]) await dataModel.createIndexes();
  console.log("Authentication, catalog, purchase-ledger, privacy, recommendation, conversation, realtime, offer, campaign, delivery, automation and redemption indexes are present.");
} finally {
  await mongoose.disconnect();
}
