import mongoose from "mongoose";
const uri = process.env.MONGODB_URI;
if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
  console.error("Atlas check failed: MONGODB_URI is missing or invalid.");
  process.exit(1);
}
try {
  const start = performance.now();
  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || "discountdirect",
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    autoIndex: false,
  });
  await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 5000 });
  console.log(
    `Atlas connected; read-only ping succeeded in ${Math.round(performance.now() - start)} ms. No records created.`,
  );
} catch {
  console.error(
    "Atlas check failed. Verify the URI, Atlas network access and database permissions. Credentials suppressed.",
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
