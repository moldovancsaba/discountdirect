import "server-only";
import mongoose from "mongoose";
import { sellerAccess } from "@/catalog/service";
import {
  blobKeys,
  privateBlobReadUrl,
  putPrivateBlob,
  type BlobArtifactKind,
} from "@/lib/blob";
import { Artifact } from "./models";
import { retentionUntil, validateArtifact } from "./core";
import { withSellerTenant } from "@/lib/tenant";

export class ArtifactError extends Error {
  constructor(
    public code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID"
      | "EXPIRED"
      | "UNAVAILABLE",
  ) {
    super(code);
  }
}
type Put = typeof putPrivateBlob;
type Sign = typeof privateBlobReadUrl;
export async function persistArtifact(
  input: {
    sellerId: string;
    kind: BlobArtifactKind;
    idempotencyKey: string;
    filename: string;
    mimeType: string;
    body: Uint8Array;
    createdByUserId: string;
    now?: Date;
  },
  dependencies: { put?: Put } = {},
) {
  if (
    !mongoose.isValidObjectId(input.sellerId) ||
    !mongoose.isValidObjectId(input.createdByUserId) ||
    !/^[A-Za-z0-9:_-]{8,180}$/.test(input.idempotencyKey)
  )
    throw new ArtifactError("INVALID");
  const checked = validateArtifact(input.kind, input.body, input.mimeType);
  const now = input.now ?? new Date();
  const existing = await withSellerTenant(
    input.sellerId,
    async () =>
      await Artifact.findOne({
        sellerId: input.sellerId,
        idempotencyKey: input.idempotencyKey,
      }).lean(),
  );
  if (existing?.status === "ready") return existing;
  if (existing?.status === "uploading") throw new ArtifactError("UNAVAILABLE");
  const id = existing?._id ?? new mongoose.Types.ObjectId();
  const blobKey =
    existing?.blobKey ??
    blobKeys.sellerArtifact({
      sellerId: input.sellerId,
      kind: input.kind,
      id: id.toString(),
      filename: input.filename,
    });
  try {
    await withSellerTenant(input.sellerId, async () => {
      if (existing?.status === "failed") {
        const retried = await Artifact.updateOne(
          {
            _id: id,
            sellerId: input.sellerId,
            status: "failed",
            sha256: checked.sha256,
          },
          {
            $set: { status: "uploading", lastErrorCode: null },
            $inc: { version: 1 },
          },
        );
        if (!retried.modifiedCount) throw new ArtifactError("UNAVAILABLE");
        return;
      }
      await Artifact.create({
        _id: id,
        sellerId: input.sellerId,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        blobKey,
        sha256: checked.sha256,
        size: checked.size,
        mimeType: input.mimeType,
        status: "uploading",
        retentionUntil: retentionUntil(input.kind, now),
        createdByUserId: input.createdByUserId,
      });
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const raced = await withSellerTenant(
        input.sellerId,
        async () =>
          await Artifact.findOne({
            sellerId: input.sellerId,
            idempotencyKey: input.idempotencyKey,
          }).lean(),
      );
      if (raced?.status === "ready") return raced;
    }
    throw error;
  }
  try {
    await (dependencies.put ?? putPrivateBlob)(
      blobKey,
      Buffer.from(input.body),
      {
        contentType: input.mimeType,
        allowOverwrite: Boolean(existing?.status === "failed"),
      },
    );
    const row = await withSellerTenant(
      input.sellerId,
      async () =>
        await Artifact.findOneAndUpdate(
          { _id: id, sellerId: input.sellerId, status: "uploading" },
          {
            $set: { status: "ready", readyAt: new Date(), lastErrorCode: null },
            $inc: { version: 1 },
          },
          { returnDocument: "after" },
        ).lean(),
    );
    if (!row) throw new ArtifactError("UNAVAILABLE");
    return row;
  } catch (error) {
    await withSellerTenant(
      input.sellerId,
      async () =>
        await Artifact.updateOne(
          { _id: id, sellerId: input.sellerId, status: "uploading" },
          {
            $set: { status: "failed", lastErrorCode: "BLOB_WRITE_FAILED" },
            $inc: { version: 1 },
          },
        ),
    );
    throw error;
  }
}
export async function artifactReadUrl(
  userId: string,
  sellerSlug: string,
  artifactId: string,
  dependencies: { sign?: Sign } = {},
) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => {
    throw new ArtifactError("FORBIDDEN");
  });
  if (!mongoose.isValidObjectId(artifactId)) throw new ArtifactError("INVALID");
  return withSellerTenant(access.seller._id, async () => {
    const row = await Artifact.findOne({
      _id: artifactId,
      sellerId: access.seller._id,
    }).lean();
    if (!row) throw new ArtifactError("NOT_FOUND");
    if (row.status !== "ready" || row.retentionUntil <= new Date())
      throw new ArtifactError("EXPIRED");
    return (dependencies.sign ?? privateBlobReadUrl)(row.blobKey, {
      ttlSeconds: 5 * 60,
      useCache: false,
    });
  });
}
