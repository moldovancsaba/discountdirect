import {
  del,
  get,
  issueSignedToken,
  list,
  presignUrl,
  put,
  type IssuedSignedToken,
  type PutBlobResult,
} from "@vercel/blob";

export type BlobEnvironment = {
  BLOB_READ_WRITE_TOKEN?: string;
  BLOB_STORE_ID?: string;
  VERCEL_OIDC_TOKEN?: string;
  [key: string]: string | undefined;
};

export type BlobReadiness =
  | { enabled: true; authMode: "read_write_token" | "oidc"; reasonCode: null }
  | {
      enabled: false;
      authMode: null;
      reasonCode: "BLOB_NOT_CONFIGURED" | "BLOB_CONFIGURATION_INCOMPLETE";
    };

export class BlobConfigurationError extends Error {
  code: Exclude<BlobReadiness["reasonCode"], null>;

  constructor(code: Exclude<BlobReadiness["reasonCode"], null>) {
    super(code);
    this.code = code;
  }
}

export type BlobArtifactKind =
  | "letter-pdf"
  | "privacy-export"
  | "audit-snapshot";

export const blobRetentionDays = {
  HU: {
    "letter-pdf": 365,
    "privacy-export": 7,
    "audit-snapshot": 365,
  },
} as const;

const safePartPattern = /^[A-Za-z0-9._-]+$/;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function blobReadiness(env: BlobEnvironment = process.env) {
  const readWriteToken = clean(env.BLOB_READ_WRITE_TOKEN);
  const oidcToken = clean(env.VERCEL_OIDC_TOKEN);
  const storeId = clean(env.BLOB_STORE_ID);
  if (readWriteToken)
    return {
      enabled: true,
      authMode: "read_write_token",
      reasonCode: null,
    } satisfies BlobReadiness;
  if (!oidcToken && !storeId)
    return {
      enabled: false,
      authMode: null,
      reasonCode: "BLOB_NOT_CONFIGURED",
    } satisfies BlobReadiness;
  if (oidcToken && storeId)
    return {
      enabled: true,
      authMode: "oidc",
      reasonCode: null,
    } satisfies BlobReadiness;
  return {
    enabled: false,
    authMode: null,
    reasonCode: "BLOB_CONFIGURATION_INCOMPLETE",
  } satisfies BlobReadiness;
}

export function blobAuthOptions(env: BlobEnvironment = process.env) {
  const readiness = blobReadiness(env);
  if (!readiness.enabled)
    throw new BlobConfigurationError(readiness.reasonCode);
  if (readiness.authMode === "read_write_token")
    return { token: clean(env.BLOB_READ_WRITE_TOKEN) };
  return {
    oidcToken: clean(env.VERCEL_OIDC_TOKEN),
    storeId: clean(env.BLOB_STORE_ID),
  };
}

export function blobKeyPart(value: string | number) {
  const raw = String(value).trim();
  if (!raw) return "_";
  if (safePartPattern.test(raw)) return raw;
  return encodeURIComponent(raw);
}

export function blobFilename(value: string) {
  return value
    .trim()
    .split("/")
    .filter(Boolean)
    .map((part) => blobKeyPart(part))
    .join("-");
}

export const blobKeys = {
  sellerArtifact(input: {
    sellerId: string;
    kind: BlobArtifactKind;
    id: string;
    filename: string;
  }) {
    return [
      "seller",
      blobKeyPart(input.sellerId),
      "artifacts",
      input.kind,
      blobKeyPart(input.id),
      blobFilename(input.filename),
    ].join("/");
  },
  sellerArtifactPrefix(sellerId: string, kind?: BlobArtifactKind) {
    return (
      ["seller", blobKeyPart(sellerId), "artifacts", kind]
        .filter(Boolean)
        .join("/") + "/"
    );
  },
} as const;

type PrivatePutBody = Parameters<typeof put>[1];

export async function putPrivateBlob(
  pathname: string,
  body: PrivatePutBody,
  options: {
    contentType?: string;
    allowOverwrite?: boolean;
    env?: BlobEnvironment;
  } = {},
): Promise<PutBlobResult> {
  return put(pathname, body, {
    ...blobAuthOptions(options.env),
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: options.allowOverwrite ?? false,
    contentType: options.contentType,
  });
}

export async function deletePrivateBlob(
  pathname: string,
  options: { env?: BlobEnvironment } = {},
) {
  return del(pathname, blobAuthOptions(options.env));
}

export function getPrivateBlob(
  pathname: string,
  options: { env?: BlobEnvironment; useCache?: boolean } = {},
) {
  return get(pathname, {
    ...blobAuthOptions(options.env),
    access: "private",
    useCache: options.useCache ?? false,
  });
}

export type PrivateReadUrlDependencies = {
  issueSignedToken(
    input: Parameters<typeof issueSignedToken>[0],
  ): Promise<IssuedSignedToken>;
  presignUrl(
    signedToken: Pick<
      IssuedSignedToken,
      "clientSigningToken" | "delegationToken"
    >,
    options: Parameters<typeof presignUrl>[1],
  ): Promise<{ presignedUrl: string }>;
};

export async function privateBlobReadUrl(
  pathname: string,
  options: {
    ttlSeconds?: number;
    now?: Date;
    useCache?: boolean;
    env?: BlobEnvironment;
    dependencies?: PrivateReadUrlDependencies;
  } = {},
) {
  const now = options.now ?? new Date();
  const ttlSeconds = Math.max(
    60,
    Math.min(options.ttlSeconds ?? 15 * 60, 24 * 60 * 60),
  );
  const validUntil = now.getTime() + ttlSeconds * 1000;
  const dependencies = options.dependencies ?? { issueSignedToken, presignUrl };
  const signedToken = await dependencies.issueSignedToken({
    ...blobAuthOptions(options.env),
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await dependencies.presignUrl(signedToken, {
    access: "private",
    operation: "get",
    pathname,
    validUntil,
    useCache: options.useCache ?? false,
  });
  return { url: presignedUrl, validUntil };
}

export type BlobHealth =
  | { connected: true; latencyMs: number }
  | {
      connected: false;
      latencyMs: null;
      reasonCode: BlobReadiness["reasonCode"] | "BLOB_UNAVAILABLE";
    };

export async function blobHealth(
  env: BlobEnvironment = process.env,
): Promise<BlobHealth> {
  const readiness = blobReadiness(env);
  if (!readiness.enabled)
    return {
      connected: false,
      latencyMs: null,
      reasonCode: readiness.reasonCode,
    };
  const start = performance.now();
  try {
    await list({ ...blobAuthOptions(env), limit: 1 });
    return {
      connected: true,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch {
    return {
      connected: false,
      latencyMs: null,
      reasonCode: "BLOB_UNAVAILABLE",
    };
  }
}
