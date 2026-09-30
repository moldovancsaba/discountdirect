export type ReleaseEnvironment = Record<string, string | undefined>;

export type ReleasePrerequisite = {
  key: string;
  status: "ready" | "blocked";
  missing: string[];
};

const requirements = [
  ["blob", [["BLOB_READ_WRITE_TOKEN"], ["VERCEL_OIDC_TOKEN", "BLOB_STORE_ID"]]],
  ["redis", [["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]]],
  ["shoprenter", [["SHOPRENTER_CONNECTOR_CREDENTIALS"]]],
  ["unas", [["UNAS_CONNECTOR_CREDENTIALS"]]],
  ["postal", [["POSTAL_DELIVERY_PROVIDER", "POSTAL_PROVIDER_ENDPOINT", "POSTAL_PROVIDER_TOKEN", "POSTAL_PROVIDER_WEBHOOK_SECRET", "POSTAL_PUBLIC_BASE_URL"]]],
] as const;

const present = (env: ReleaseEnvironment, key: string) => Boolean(env[key]?.trim());

export function releasePrerequisites(env: ReleaseEnvironment = process.env): ReleasePrerequisite[] {
  return requirements.map(([key, alternatives]) => {
    const satisfied = alternatives.some((variables) => variables.every((variable) => present(env, variable)));
    const missing = satisfied ? [] : [...alternatives[0]];
    return { key, status: missing.length ? "blocked" : "ready", missing: [...missing] };
  });
}

export function releaseReadiness(env: ReleaseEnvironment = process.env) {
  const prerequisites = releasePrerequisites(env);
  return {
    status: prerequisites.every((item) => item.status === "ready") ? "ready" as const : "blocked" as const,
    prerequisites,
  };
}
