import { getRolloutConfig } from "./rolloutConfigStore.js";
import type { RolloutConfig, RolloutPercent } from "./rolloutSchemas.js";

/** The one rollout a request snapshot freezes; the store may hold others, nothing reads them. */
export const ACTIVE_ROLLOUT_ID = "balance-worker";

/**
 * A percent change takes effect this long after it was saved, so every pod flips at the same instant:
 * past the 10s config poll in production, past the 1s poll locally.
 */
export const ROLLOUT_SETTLE_MS =
	process.env.NODE_ENV === "production" ? 15_000 : 5_000;

export const rolloutEffectiveAt = ({
	changedAt,
}: {
	changedAt: number;
}): number => changedAt + ROLLOUT_SETTLE_MS;

/** The percent that routes at `now`: the previous one until the change has settled. */
const routingPercentAt = ({
	rollout,
	now,
}: {
	rollout: RolloutPercent;
	now: number;
}): number =>
	now >= rolloutEffectiveAt({ changedAt: rollout.changedAt })
		? rollout.percent
		: rollout.previousPercent;

const isEnabledAtPercent = ({
	percent,
	customerBucket,
}: {
	percent: number;
	customerBucket: number | null;
}): boolean => {
	if (percent >= 100) return true;
	if (percent <= 0) return false;
	return customerBucket !== null && customerBucket < percent;
};

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
	config = getRolloutConfig(),
}: {
	rolloutId: string;
	orgId: string;
	config?: RolloutConfig;
}): RolloutPercent | undefined => {
	const entry = config.rollouts[rolloutId];
	if (!entry) return undefined;
	return entry.orgs[orgId] ?? entry;
};

/** Checks whether a rollout is enabled for a given customer. */
export const isRolloutEnabled = ({
	rolloutId,
	orgId,
	customerId,
	now = Date.now(),
	config = getRolloutConfig(),
}: {
	rolloutId: string;
	orgId: string;
	customerId?: string;
	now?: number;
	config?: RolloutConfig;
}): boolean => {
	const rollout = resolveRolloutPercent({ rolloutId, orgId, config });
	if (!rollout) return false;
	return isEnabledAtPercent({
		percent: routingPercentAt({ rollout, now }),
		customerBucket: customerId ? getCustomerBucket({ customerId }) : null,
	});
};

/**
 * A cache entry written before the subject crossed the rollout boundary describes the other path.
 * Stale only once the change has settled, only for a bucket that actually crossed, and only for an
 * entry older than the settle instant (no timestamp counts as older).
 */
export const isRolloutCacheStale = ({
	rolloutId,
	orgId,
	customerId,
	cachedAt,
	now = Date.now(),
	config = getRolloutConfig(),
}: {
	rolloutId: string;
	orgId: string;
	customerId: string;
	cachedAt?: number;
	now?: number;
	config?: RolloutConfig;
}): boolean => {
	const rollout = resolveRolloutPercent({ rolloutId, orgId, config });
	if (!rollout || !rollout.changedAt) return false;

	const effectiveAt = rolloutEffectiveAt({ changedAt: rollout.changedAt });
	if (now < effectiveAt) return false;

	const customerBucket = getCustomerBucket({ customerId });
	const wasEnabled = isEnabledAtPercent({
		percent: rollout.previousPercent,
		customerBucket,
	});
	const isEnabled = isEnabledAtPercent({
		percent: rollout.percent,
		customerBucket,
	});
	if (wasEnabled === isEnabled) return false;

	if (!cachedAt) return true;
	return cachedAt < effectiveAt;
};
