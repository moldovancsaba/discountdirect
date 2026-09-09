import mongoose from "mongoose";
import { authModels } from "../src/auth/models.ts";
import { catalogModels } from "../src/catalog/models.ts";
import { purchaseModels } from "../src/purchases/models.ts";
import { privacyModels } from "../src/privacy/models.ts";
import { recommendationModels } from "../src/recommendations/models.ts";
import { messagingModels } from "../src/messaging/models.ts";
import { realtimeModels } from "../src/realtime/models.ts";

const uri = process.env.MONGODB_URI;
if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri))
  throw new Error("MONGODB_URI is missing or invalid");
await mongoose.connect(uri, {
  dbName: process.env.MONGODB_DB || "discountdirect",
  serverSelectionTimeoutMS: 5000,
  autoIndex: false,
});
try {
  for (const dataModel of [...authModels, ...catalogModels, ...purchaseModels, ...privacyModels, ...recommendationModels, ...messagingModels, ...realtimeModels]) await dataModel.createIndexes();
  console.log("Authentication, catalog, purchase-ledger, privacy, recommendation, conversation and realtime indexes are present.");
} finally {
  await mongoose.disconnect();
}
