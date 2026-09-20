export type PostalFulfillmentStatus = "ready" | "printed" | "posted";

export function nextFulfillmentStatus(current: PostalFulfillmentStatus, action: unknown) {
  if (action === "mark_printed" && current === "ready") return "printed" as const;
  if (action === "mark_posted" && current === "printed") return "posted" as const;
  throw new Error("POSTAL_TRANSITION_INVALID");
}
