import type { VersionedRateLimit } from "./versionedRateLimit";

export type RateLimitLayer = {
	/** Counter, Redis key prefix and S3 override key; renaming it orphans both. */
	name: string;
	limit: number | VersionedRateLimit;
	windowMs: number;
	/** perPod counts in memory unless the customer is on the Redis allowlist. */
	counted?: "allPods" | "perPod";
	/** degrade serves the request via its fallback path; rejectAndQueueCreate 429s and queues creates. */
	overLimit?: "reject" | "degrade" | "rejectAndQueueCreate";
	skipWithoutCustomerId?: boolean;
};
