import mongoose from "mongoose";
import {
  BuyerRelationship,
  Membership,
  Seller,
  User,
} from "../src/auth/models.ts";
import { normalizeEmail } from "../src/auth/crypto.ts";

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = normalizeEmail(option("email") ?? "");
const displayName = option("name")?.trim();
const role = option("role");
const sellerSlug = option("seller-slug")?.trim().toLowerCase();
const sellerName = option("seller-name")?.trim();
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
  if (!user)
    user = await User.create({
      emailNormalized: email,
      displayName,
      status: "pending",
      systemRole: null,
    });
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
  console.log("SSO account shell prepared:");
  console.log(`- user: ${user.emailNormalized}`);
  console.log(`- role: ${role}`);
  console.log(`- createdBy: ${createdBy}`);
  console.log("No DiscountDirect password or activation link was created. The user must sign in with DoneIsBetter SSO.");
} finally {
  await mongoose.disconnect();
}
