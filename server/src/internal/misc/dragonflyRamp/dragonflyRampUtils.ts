import { getCustomerBucket } from "@/internal/misc/rollouts/rolloutUtils.js";
import { type DragonflyRampPercent, getDragonflyRampConfig } from "./index.js";

const resolveDragonflyRampPercent = ({
	orgId,
}: {
	orgId?: string;
}): DragonflyRampPercent => {
	const config = getDragonflyRampConfig();
	if (orgId && config.orgs[orgId]) return config.orgs[orgId];
	return {
		percent: config.percent,
		previousPercent: config.previousPercent,
		changedAt: config.changedAt,
	};
};

/** True when the given customer should be routed to the public Dragonfly URL. */
export const isDragonflyPublicEnabled = ({
	orgId,
	customerId,
}: {
	orgId?: string;
	customerId?: string;
}): boolean => {
	const resolved = resolveDragonflyRampPercent({ orgId });
	if (resolved.percent >= 100) return true;
	if (resolved.percent <= 0) return false;
	if (!customerId) return false;

	const bucket = getCustomerBucket({ customerId });
	return bucket < resolved.percent;
};

/** True when the dragonfly public-ramp is non-zero for the given org (or globally).
 *  Used by invalidation/lock-receipt code that needs to fan out to BOTH clusters
 *  during the ramp window, even when it doesn't know the customer. */
export const isDragonflyRampActive = ({
	orgId,
}: {
	orgId?: string;
}): boolean => {
	const resolved = resolveDragonflyRampPercent({ orgId });
	return resolved.percent > 0;
};

/** True when a cached entry should be treated as stale because the customer's
 *  bucket crossed the ramp boundary after the entry was written.
 *
 *  Mirrors `isSnapshotCacheStale` in rolloutUtils.ts. Use when reading from
 *  either Dragonfly cluster — if the customer was on the OTHER cluster when
 *  the entry was written, and has since crossed back, the entry is stale. */
export const isDragonflyRampCacheStale = ({
	orgId,
	customerId,
	cachedAt,
}: {
	orgId?: string;
	customerId?: string;
	cachedAt?: number;
}): boolean => {
	const resolved = resolveDragonflyRampPercent({ orgId });
	if (!resolved.changedAt) return false;
	if (!customerId) return false;

	const bucket = getCustomerBucket({ customerId });
	const wasEnabled = bucket < resolved.previousPercent;
	const isEnabled = bucket < resolved.percent;
	if (wasEnabled === isEnabled) return false;

	if (!cachedAt) return true;
	return cachedAt < resolved.changedAt;
};
