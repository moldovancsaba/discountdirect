import mongoose from "mongoose";
import { sellerScopedSchema } from "../lib/tenant-core.ts";
const { Schema, model, models } = mongoose;

const connectorInstallationSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  provider: { type: String, enum: ["shoprenter", "unas"], required: true },
  status: { type: String, enum: ["disconnected", "testing", "healthy", "degraded", "disabled", "action_required"], required: true, default: "disconnected" },
  credentialRef: { type: String, required: true, maxlength: 240 },
  configuration: { shopName: { type: String, default: null, maxlength: 80 }, shopUrl: { type: String, required: true, maxlength: 500 }, checkoutUrlTemplate: { type: String, required: true, maxlength: 800 } },
  cursor: { type: String, default: null, maxlength: 500 },
  cursors: { catalog_sync: { type: String, default: null, maxlength: 500 }, order_sync: { type: String, default: null, maxlength: 500 }, stock_sync: { type: String, default: null, maxlength: 500 } },
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
  leaseExpiresAt: { type: Date, default: null, index: true }, nextAttemptAt: { type: Date, default: null, index: true },
  cursorBefore: { type: String, default: null, maxlength: 500 }, cursorAfter: { type: String, default: null, maxlength: 500 },
  itemCount: { type: Number, required: true, default: 0, min: 0, max: 100 },
  errorCode: { type: String, default: null, maxlength: 80 },
}, { timestamps: true, versionKey: false, collection: "connector_runs" });
connectorRunSchema.index({ sellerId: 1, idempotencyKey: 1 }, { unique: true });
connectorRunSchema.index({ status: 1, nextAttemptAt: 1 });

const connectorRecordSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  installationId: { type: Schema.Types.ObjectId, required: true, ref: "ConnectorInstallation", index: true },
  provider: { type: String, enum: ["shoprenter", "unas"], required: true },
  kind: { type: String, enum: ["catalog_sync", "order_sync", "stock_sync"], required: true },
  providerId: { type: String, required: true, maxlength: 160 },
  checksum: { type: String, required: true, maxlength: 64 },
  payload: { type: Schema.Types.Mixed, required: true },
  sourceUpdatedAt: { type: Date, default: null },
  lastRunId: { type: Schema.Types.ObjectId, required: true, ref: "ConnectorRun" },
}, { timestamps: true, versionKey: false, collection: "connector_records" });
connectorRecordSchema.index({ sellerId: 1, installationId: 1, kind: 1, providerId: 1 }, { unique: true });
connectorInstallationSchema.plugin(sellerScopedSchema); connectorRunSchema.plugin(sellerScopedSchema); connectorRecordSchema.plugin(sellerScopedSchema);
export const ConnectorInstallation = models.ConnectorInstallation || model("ConnectorInstallation", connectorInstallationSchema);
export const ConnectorRun = models.ConnectorRun || model("ConnectorRun", connectorRunSchema);
export const ConnectorRecord = models.ConnectorRecord || model("ConnectorRecord", connectorRecordSchema);
export const connectorModels = [ConnectorInstallation, ConnectorRun, ConnectorRecord];
