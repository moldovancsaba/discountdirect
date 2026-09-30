import { releaseReadiness } from "../src/lib/release-readiness.ts";

const result = releaseReadiness();
console.log(JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2));
if (result.status !== "ready") process.exitCode = 2;
