import mongoose from "mongoose";
import {
  AccessToken,
  BuyerRelationship,
  Membership,
  Seller,
  Session,
  User,
} from "../src/auth/models.ts";
import {
  createOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
} from "../src/auth/crypto.ts";

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = normalizeEmail(option("email") ?? "");
const displayName = option("name")?.trim();
const role = option("role");
const sellerSlug = option("seller-slug")?.trim().toLowerCase();
const sellerName = option("seller-name")?.trim();
const purpose = option("purpose") === "recovery" ? "recovery" : "activation";
const createdBy = option("created-by")?.trim();
if (
  !displayName ||
  displayName.length > 120 ||
  !["operator", "seller", "buyer"].includes(role ?? "") ||
  !createdBy
) {
  throw new Error(
    "Required: --email --name --role operator|seller|buyer --created-by. Seller/buyer roles also require --seller-slug; a new seller requires --seller-name.",
  );
}
if ((role === "seller" || role === "buyer") && !sellerSlug)
  throw new Error("--seller-slug is required for seller and buyer roles");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");
await mongoose.connect(uri, {
  dbName: process.env.MONGODB_DB || "discountdirect",
  serverSelectionTimeoutMS: 5000,
  autoIndex: false,
});
try {
  let user = await User.findOne({ emailNormalized: email });
  if (purpose === "recovery" && (!user || user.status !== "active")) {
    throw new Error("Recovery requires an existing active user");
  }
  if (!user)
    user = await User.create({
      emailNormalized: email,
      displayName,
      status: "pending",
      systemRole: role === "operator" ? "operator" : null,
    });
  else if (role === "operator" && user.systemRole !== "operator")
    throw new Error(
      "Refusing to elevate an existing user; review and update the user explicitly",
    );
  let seller;
  if (sellerSlug) {
    seller = await Seller.findOne({ slug: sellerSlug });
    if (!seller && role === "seller" && sellerName)
      seller = await Seller.create({ slug: sellerSlug, name: sellerName });
    if (!seller)
      throw new Error(
        "Seller does not exist; provide --seller-name when provisioning its first seller owner",
      );
    if (role === "seller")
      await Membership.updateOne(
        { sellerId: seller._id, userId: user._id },
        { $setOnInsert: { role: "owner", status: "active" } },
        { upsert: true },
      );
    if (role === "buyer")
      await BuyerRelationship.updateOne(
        { sellerId: seller._id, buyerUserId: user._id },
        { $setOnInsert: { status: "active" } },
        { upsert: true },
      );
  }
  const now = new Date();
  await AccessToken.updateMany(
    { userId: user._id, purpose, consumedAt: null, revokedAt: null },
    { $set: { revokedAt: now } },
  );
  if (purpose === "recovery")
    await Session.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: now } },
    );
  const token = createOpaqueToken();
  await AccessToken.create({
    tokenHash: hashOpaqueToken(token),
    userId: user._id,
    purpose,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdBy,
  });
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  console.log(
    `${purpose === "recovery" ? "Recovery" : "Activation"} link (shown once; expires in one hour):`,
  );
  console.log(`${appUrl}/activate?token=${token}`);
} finally {
  await mongoose.disconnect();
}
