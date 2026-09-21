import mongoose from "mongoose";
import { connectDatabase } from "../src/lib/database.ts";
import { withTenantBypass } from "../src/lib/tenant-core.ts";
import { OfferHandoff } from "../src/handoff/models.ts";

if (process.env.HANDOFF_ENABLED !== "false") throw new Error("Set HANDOFF_ENABLED=false before revoking hand-offs.");
await connectDatabase();
const result = await withTenantBypass("operator-handoff-rollback", async () => OfferHandoff.updateMany({ status: { $in: ["issued", "processing"] } }, { $set: { status: "revoked", processingStartedAt: null, lastErrorCode: "HANDOFF_DISABLED" }, $inc: { version: 1 } }));
console.log(JSON.stringify({ revoked: result.modifiedCount }));
await mongoose.disconnect();
