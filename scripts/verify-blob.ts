import { randomUUID } from "node:crypto";
import {
  deletePrivateBlob,
  getPrivateBlob,
  privateBlobReadUrl,
  putPrivateBlob,
  blobReadiness,
} from "../src/lib/blob-core.ts";

const pathname = `verification/discountdirect-${randomUUID()}.txt`;
const body = `DiscountDirect artifact verification ${new Date().toISOString()}`;

const readiness = blobReadiness();
if (!readiness.enabled) {
  console.log(JSON.stringify({ ok: false, blocked: true, reasonCode: readiness.reasonCode }));
  process.exitCode = 2;
} else try {
  await putPrivateBlob(pathname, body, {
    contentType: "text/plain; charset=utf-8",
  });
  const stored = await getPrivateBlob(pathname);
  if (!stored || stored.statusCode !== 200) throw new Error("BLOB_READ_FAILED");
  const signed = await privateBlobReadUrl(pathname, {
    ttlSeconds: 300,
    useCache: false,
  });
  const response = await fetch(signed.url);
  const downloaded = await response.text();
  if (!response.ok || downloaded !== body)
    throw new Error("BLOB_SIGNED_READ_FAILED");
  console.log(
    JSON.stringify({ ok: true, pathname, privateRead: true, signedRead: true }),
  );
} finally {
  await deletePrivateBlob(pathname).catch(() => undefined);
}
