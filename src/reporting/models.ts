import mongoose from "mongoose";
import { sellerScopedSchema } from "../lib/tenant-core.ts";

const { Schema, model, models } = mongoose;
const rollupSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  generationId: { type: String, required: true, maxlength: 64 },
  scope: { type: String, enum: ["seller_day", "campaign"], required: true },
  scopeId: { type: String, required: true, maxlength: 80 },
  day: { type: Date, required: true },
  schemaVersion: { type: Number, required: true, min: 1 },
  counters: { type: Schema.Types.Mixed, required: true },
  computedAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "metric_rollups" });
rollupSchema.index({ sellerId: 1, generationId: 1, scope: 1, scopeId: 1, day: 1 }, { unique: true });
rollupSchema.index({ sellerId: 1, generationId: 1, scope: 1, day: -1 });

const checkpointSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", unique: true },
  activeGenerationId: { type: String, default: null, maxlength: 64 },
  schemaVersion: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["ready", "running", "failed"], required: true },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date, default: null },
  lastErrorCode: { type: String, default: null, maxlength: 120 },
}, { timestamps: true, versionKey: false, collection: "metric_projection_checkpoints" });

rollupSchema.plugin(sellerScopedSchema);
checkpointSchema.plugin(sellerScopedSchema);
export const MetricRollup = models.MetricRollup || model("MetricRollup", rollupSchema);
export const MetricProjectionCheckpoint = models.MetricProjectionCheckpoint || model("MetricProjectionCheckpoint", checkpointSchema);
export const reportingModels = [MetricRollup, MetricProjectionCheckpoint];
