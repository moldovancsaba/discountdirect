import mongoose from "mongoose";
import { sellerScopedSchema } from "@/lib/tenant-core.ts";
const { Schema, model, models } = mongoose;

const connectorInstallationSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  provider: { type: String, enum: ["shoprenter", "unas"], required: true },
  status: { type: String, enum: ["disconnected", "testing", "healthy", "degraded", "disabled", "action_required"], required: true, default: "disconnected" },
  credentialRef: { type: String, required: true, maxlength: 240 },
  cursor: { type: String, default: null, maxlength: 500 },
  lastSuccessAt: { type: Date, default: null },
  lastErrorCode: { type: String, default: null, maxlength: 80 },
  version: { type: Number, required: true, default: 1, min: 1 },
  createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  updatedByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
}, { timestamps: true, versionKey: false, collection: "connector_installations" });
connectorInstallationSchema.index({ sellerId: 1, provider: 1 }, { unique: true });

const connectorRunSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  installationId: { type: Schema.Types.ObjectId, required: true, ref: "ConnectorInstallation", index: true },
  kind: { type: String, enum: ["connection_test", "catalog_sync", "order_sync", "stock_sync", "checkout"], required: true },
  idempotencyKey: { type: String, required: true, maxlength: 180 },
  status: { type: String, enum: ["running", "succeeded", "retryable_failed", "failed"], required: true },
  attempt: { type: Number, required: true, min: 1, default: 1 },
  startedAt: { type: Date, required: true }, finishedAt: { type: Date, default: null },
  errorCode: { type: String, default: null, maxlength: 80 },
}, { timestamps: true, versionKey: false, collection: "connector_runs" });
connectorRunSchema.index({ sellerId: 1, idempotencyKey: 1 }, { unique: true });
connectorInstallationSchema.plugin(sellerScopedSchema); connectorRunSchema.plugin(sellerScopedSchema);
export const ConnectorInstallation = models.ConnectorInstallation || model("ConnectorInstallation", connectorInstallationSchema);
export const ConnectorRun = models.ConnectorRun || model("ConnectorRun", connectorRunSchema);
export const connectorModels = [ConnectorInstallation, ConnectorRun];
