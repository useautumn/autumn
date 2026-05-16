import { onAwsEcs } from "@/external/aws/ecs/onAwsEcs.js";

/**
 * Map a stored dragonfly URL to one that is actually reachable from the
 * current process.
 *
 * Background: orgs whose `redis_config` points at the SHARED dragonfly
 * instance store its private VPC URL (`CACHE_V2_DRAGONFLY_URL`) in the
 * config row. That URL is only reachable from inside our AWS Fargate
 * tasks. Off-AWS callers (local dev, trigger.dev workers) need the
 * public mirror `CACHE_V2_DRAGONFLY_PUBLIC_URL` instead.
 *
 * Heuristic: if the URL equals the private shared URL AND we're not on
 * AWS, swap to public. Anything else (per-org dragonfly, Upstash, Redis
 * Cloud, etc.) is returned untouched — we have no opinion about those.
 *
 * Returns the same input string when no swap applies, so callers can use
 * it transparently in place of the raw URL.
 */
export const getReachableDragonflyUrl = (url: string): string => {
	if (onAwsEcs()) return url;

	const privateUrl = process.env.CACHE_V2_DRAGONFLY_URL?.trim();
	if (!privateUrl || url.trim() !== privateUrl) return url;

	const publicUrl = process.env.CACHE_V2_DRAGONFLY_PUBLIC_URL?.trim();
	if (!publicUrl) return url;

	return publicUrl;
};
