import mongoose from "mongoose";

type Cache = { pending?: Promise<typeof mongoose> };
const globalDatabase = globalThis as typeof globalThis & {
  discountDirectDatabase?: Cache;
};
const cache = (globalDatabase.discountDirectDatabase ??= {});

export async function connectDatabaseCore() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri))
    throw new Error("DATABASE_NOT_CONFIGURED");
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!cache.pending) {
    cache.pending = mongoose
      .connect(uri, {
        dbName: process.env.MONGODB_DB || "discountdirect",
        maxPoolSize: 5,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        bufferCommands: false,
        autoIndex: false,
      })
      .catch(() => {
        throw new Error("DATABASE_UNAVAILABLE");
      })
      .finally(() => {
        cache.pending = undefined;
      });
  }
  return cache.pending;
}
