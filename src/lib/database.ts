import "server-only";
import { connectDatabaseCore } from "./database-core.ts";

export async function connectDatabase() {
  return connectDatabaseCore();
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
