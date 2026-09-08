import "server-only";
import mongoose from "mongoose";

type Cache = { pending?: Promise<typeof mongoose> };
const globalDatabase = globalThis as typeof globalThis & {
  discountDirectDatabase?: Cache;
};
const cache = (globalDatabase.discountDirectDatabase ??= {});

export async function connectDatabase() {
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

export async function databaseHealth() {
  const start = performance.now();
  try {
    const connection = await connectDatabase();
    await connection.connection.db!.command({ ping: 1 }, { timeoutMS: 5000 });
    return {
      connected: true,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch {
    return { connected: false, latencyMs: null };
  }
}
