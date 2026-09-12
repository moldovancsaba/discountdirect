import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
  throw new Error("MONGODB_URI is missing or invalid");
}

const dbName = `dd_restore_${randomBytes(5).toString("hex")}`;
if (!dbName.startsWith("dd_restore_")) {
  throw new Error("Refusing to run restore drill outside a disposable database");
}

const connection = await mongoose.createConnection(uri, {
  dbName,
  maxPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 5000,
  autoIndex: false,
}).asPromise();

try {
  const collection = connection.collection("restore_probe");
  const original = {
    probeId: randomBytes(12).toString("hex"),
    service: "discountdirect",
    createdAt: new Date(),
    payload: { purpose: "synthetic restore drill", version: "1.4.1" },
  };
  const expected = JSON.parse(JSON.stringify(original));

  await collection.insertOne(original);
  const exported = await collection.findOne({ probeId: original.probeId }, { projection: { _id: 0 } });
  assert.deepEqual(JSON.parse(JSON.stringify(exported)), expected);

  await collection.deleteOne({ probeId: original.probeId });
  assert.equal(await collection.countDocuments({ probeId: original.probeId }), 0);

  await collection.insertOne(exported);
  const restored = await collection.findOne({ probeId: original.probeId }, { projection: { _id: 0 } });
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), expected);

  await collection.deleteMany({ probeId: original.probeId });
  assert.equal(await collection.countDocuments({ probeId: original.probeId }), 0);
  await collection.drop().catch(() => undefined);
  console.log(`Restore drill passed using disposable database ${dbName}; synthetic probe data removed after verification.`);
} finally {
  await connection.collection("restore_probe").deleteMany({}).catch(() => undefined);
  await connection.collection("restore_probe").drop().catch(() => undefined);
  await connection.close();
}
