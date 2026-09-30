import { getRolloutConfig } from "./rolloutConfigStore.js";
import type {
	RolloutConfig,
	RolloutCustomer,
	RolloutPercent,
} from "./rolloutSchemas.js";

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
export const routingPercentAt = ({
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

export const findRolloutCustomer = ({
	rolloutId,
	orgId,
	customerId,
	config = getRolloutConfig(),
}: {
	rolloutId: string;
	orgId: string;
	customerId: string;
	config?: RolloutConfig;
}): RolloutCustomer | undefined =>
	config.rollouts[rolloutId]?.customers[orgId]?.[customerId];

/** Pinned from its add until its removal, each landing one settle window after it was saved. */
export const isCustomerPinnedAt = ({
	customer,
	now,
}: {
	customer: RolloutCustomer;
	now: number;
}): boolean => {
	const added = now >= rolloutEffectiveAt({ changedAt: customer.addedAt });
	const removed =
		customer.removedAt !== undefined &&
		now >= rolloutEffectiveAt({ changedAt: customer.removedAt });
	return added && !removed;
};

/** Checks whether a rollout is enabled for a given customer: a pinned customer, else the org or global percent. */
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
	const customer = customerId
		? findRolloutCustomer({ rolloutId, orgId, customerId, config })
		: undefined;
	if (customer && isCustomerPinnedAt({ customer, now })) return true;

	const rollout = resolveRolloutPercent({ rolloutId, orgId, config });
	if (!rollout) return false;
	return isEnabledAtPercent({
		percent: routingPercentAt({ rollout, now }),
		customerBucket: customerId ? getCustomerBucket({ customerId }) : null,
	});
};

const viewPredatesCustomerRemoval = ({
	customer,
	cachedAt,
	now,
}: {
	customer: RolloutCustomer;
	cachedAt?: number;
	now: number;
}): boolean => {
	if (customer.removedAt === undefined) return false;
	const cameBackAt = rolloutEffectiveAt({ changedAt: customer.removedAt });
	return now >= cameBackAt && (cachedAt ?? 0) < cameBackAt;
};

const viewPredatesPercentDecrease = ({
	rollout,
	customerId,
	cachedAt,
	now,
}: {
	rollout: RolloutPercent;
	customerId: string;
	cachedAt?: number;
	now: number;
}): boolean => {
	const customerBucket = getCustomerBucket({ customerId });
	return rollout.decreases.some(({ from, to, at }) => {
		const sentThisBucketBack = customerBucket >= to && customerBucket < from;
		const cameBackAt = rolloutEffectiveAt({ changedAt: at });
		return (
			sentThisBucketBack && now >= cameBackAt && (cachedAt ?? 0) < cameBackAt
		);
	});
};

/**
 * A legacy customer's Redis view is stale when a settled removal or decrease sent them back to legacy after
 * the view was built. A view with no timestamp counts as older than any of them.
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
	const customer = findRolloutCustomer({
		rolloutId,
		orgId,
		customerId,
		config,
	});
	const rollout = resolveRolloutPercent({ rolloutId, orgId, config });
	const staleByRemoval =
		customer !== undefined &&
		viewPredatesCustomerRemoval({ customer, cachedAt, now });
	const staleByDecrease =
		rollout !== undefined &&
		viewPredatesPercentDecrease({ rollout, customerId, cachedAt, now });
	return staleByRemoval || staleByDecrease;
};
