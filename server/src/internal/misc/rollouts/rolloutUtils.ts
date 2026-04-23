import type { RolloutSnapshot } from "@/honoUtils/HonoEnv.js";
import { getRolloutConfig } from "./rolloutConfigStore.js";
import type { RolloutPercent } from "./rolloutSchemas.js";

/** Deterministic bucket (0-99) for a customer ID. */
export const getCustomerBucket = ({
	customerId,
}: {
	customerId: string;
}): number => Number(BigInt(Bun.hash(customerId)) % 100n);

/** Resolves the effective percent config for a rollout (org override > global). */
export const resolveRolloutPercent = ({
	rolloutId,
	orgId,
}: {
	rolloutId: string;
	orgId: string;
}): RolloutPercent | undefined => {
	const config = getRolloutConfig();
	const entry = config.rollouts[rolloutId];
	if (!entry) return undefined;
	return entry.orgs[orgId] ?? entry;
};

/** Checks whether a rollout is enabled for a given customer. */
export const isRolloutEnabled = ({
	rolloutId,
	orgId,
	customerId,
}: {
	rolloutId: string;
	orgId: string;
	customerId?: string;
}): boolean => {
	const resolved = resolveRolloutPercent({ rolloutId, orgId });
	if (!resolved) return false;
	if (resolved.percent >= 100) return true;
	if (resolved.percent <= 0) return false;
	if (!customerId) return false;

	const bucket = getCustomerBucket({ customerId });
	return bucket < resolved.percent;
};

/**
 * Computes a flat rollout snapshot for the first active rollout.
 * Used by middleware and worker context factories to freeze the rollout
 * decision for the lifetime of a request/job.
 */
export const computeRolloutSnapshot = ({
	orgId,
	customerId,
}: {
	orgId?: string;
	customerId?: string;
}): RolloutSnapshot => {
	const customerBucket = customerId ? getCustomerBucket({ customerId }) : null;
	const config = getRolloutConfig();
	const entries = Object.entries(config.rollouts);

	if (entries.length === 0) {
		return {
			rolloutId: null,
			enabled: false,
			percent: 0,
			previousPercent: 0,
			changedAt: 0,
			customerBucket,
		};
	}

	const [rolloutId, entry] = entries[0];
	const resolved = orgId && entry.orgs[orgId] ? entry.orgs[orgId] : entry;

	return {
		rolloutId,
		enabled:
			resolved.percent >= 100 ||
			(customerBucket !== null && customerBucket < resolved.percent),
		percent: resolved.percent,
		previousPercent: resolved.previousPercent,
		changedAt: resolved.changedAt,
		customerBucket,
	};
};

/**
 * Checks if a cache entry is stale due to a rollout percentage change.
 * Works with the per-request rollout snapshot to avoid race conditions.
 *
 * Returns true only when:
 * 1. The customer's routing actually changed between previousPercent and percent
 * 2. The cache entry was written before changedAt (or has no _cachedAt -- legacy conservative mode)
 */
export const isSnapshotCacheStale = ({
	snapshot,
	cachedAt,
}: {
	snapshot: RolloutSnapshot;
	cachedAt?: number;
}): boolean => {
	if (!snapshot.changedAt || snapshot.customerBucket === null) return false;

	const wasEnabled = snapshot.customerBucket < snapshot.previousPercent;
	const isEnabled = snapshot.customerBucket < snapshot.percent;

	if (wasEnabled === isEnabled) return false;

	if (!cachedAt) return true;
	return cachedAt < snapshot.changedAt;
};
