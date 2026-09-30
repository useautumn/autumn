import { ErrCode } from "@autumn/shared";
import type { z } from "zod/v4";
import { ADMIN_ROLLOUT_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import RecaseError from "@/utils/errorUtils.js";
import {
	type RolloutConfig,
	RolloutConfigSchema,
	type RolloutCustomer,
	type RolloutEntry,
	type RolloutPercent,
} from "./rolloutSchemas.js";
import { rolloutEffectiveAt, routingPercentAt } from "./rolloutUtils.js";

// An S3 read error must not send every routed customer back to the old path with no handoff.
const store = createEdgeConfigStore<RolloutConfig>({
	s3Key: ADMIN_ROLLOUT_CONFIG_KEY,
	schema: RolloutConfigSchema,
	defaultValue: () => ({ rollouts: {} }),
	retainOnError: true,
});

registerEdgeConfig({ store });

export const getRolloutConfig = () => store.get();
export const getRolloutConfigStatus = () => store.getStatus();
export const getRolloutConfigFromSource = async () => store.readFromSource();
/** The store handle, for runtimes that poll a chosen few configs (see startEdgeConfigPolling). */
export const rolloutEdgeConfig = store;
export const _setRolloutConfigForTesting = ({
	config,
}: {
	config: z.input<typeof RolloutConfigSchema>;
}) => store._setRuntimeConfigForTesting(RolloutConfigSchema.parse(config));

// No Redis view outlives its TTL, so a decrease or removal older than that cannot mark one stale.
const STALENESS_RETENTION_MS = FULL_SUBJECT_CACHE_TTL_SECONDS * 1000;

const emptyRolloutEntry = (): RolloutEntry => ({
	percent: 0,
	previousPercent: 0,
	changedAt: 0,
	decreases: [],
	orgs: {},
	customers: {},
});

/** A scheduled change starts from what routes right now; a new org override inherits that from the global entry. */
export const scheduleRolloutPercent = ({
	current,
	percent,
	now,
}: {
	current: RolloutPercent;
	percent: number;
	now: number;
}): RolloutPercent => {
	const routing = routingPercentAt({ rollout: current, now });
	const decreases = current.decreases.filter(
		({ at }) => at > now - STALENESS_RETENTION_MS,
	);
	if (percent < routing)
		decreases.push({ from: routing, to: percent, at: now });
	return { previousPercent: routing, percent, changedAt: now, decreases };
};

/** Update a rollout percentage (global or per-org). Auto-manages previousPercent and changedAt. */
export const updateRolloutPercent = async ({
	rolloutId,
	orgId,
	percent,
	now = Date.now(),
}: {
	rolloutId: string;
	orgId?: string;
	percent: number;
	now?: number;
}) => {
	const config = await store.readFromSource();

	const entry = config.rollouts[rolloutId] ?? emptyRolloutEntry();

	if (orgId) {
		// An org with no override has been following the global entry.
		entry.orgs[orgId] = scheduleRolloutPercent({
			current: entry.orgs[orgId] ?? entry,
			percent,
			now,
		});
	} else {
		Object.assign(
			entry,
			scheduleRolloutPercent({ current: entry, percent, now }),
		);
	}

	config.rollouts[rolloutId] = entry;
	await store.writeToSource({ config });

	return config;
};

/** Remove an org override: the org follows the global entry again from the next config poll. */
export const removeRolloutOrg = async ({
	rolloutId,
	orgId,
}: {
	rolloutId: string;
	orgId: string;
}) => {
	const config = await store.readFromSource();
	const entry = config.rollouts[rolloutId];
	if (!entry) return config;

	delete entry.orgs[orgId];
	await store.writeToSource({ config });

	return config;
};

/** Every org override above 0 is scheduled down to 0; one already there keeps its change time. */
export const scheduleOrgsToZero = ({
	orgs,
	now,
}: {
	orgs: RolloutEntry["orgs"];
	now: number;
}): RolloutEntry["orgs"] =>
	Object.fromEntries(
		Object.entries(orgs).map(([orgId, current]) => [
			orgId,
			current.percent === 0
				? current
				: scheduleRolloutPercent({ current, percent: 0, now }),
		]),
	);

/** Send every org override back to the legacy path in one write; the overrides stay, at 0. */
export const resetRolloutOrgs = async ({
	rolloutId,
	now = Date.now(),
}: {
	rolloutId: string;
	now?: number;
}) => {
	const config = await store.readFromSource();
	const entry = config.rollouts[rolloutId];
	if (!entry) return config;

	entry.orgs = scheduleOrgsToZero({ orgs: entry.orgs, now });
	await store.writeToSource({ config });

	return config;
};

/** Re-adding a customer before its removal lands cancels the removal, so it never dips back to the fallback. */
export const scheduleCustomerAdd = ({
	current,
	now,
}: {
	current: RolloutCustomer | undefined;
	now: number;
}): RolloutCustomer => {
	if (!current) return { addedAt: now };
	if (current.removedAt === undefined) return current;
	const removalLanded =
		now >= rolloutEffectiveAt({ changedAt: current.removedAt });
	return removalLanded ? { addedAt: now } : { addedAt: current.addedAt };
};

/** A second removal keeps the first one's time, which is when the customer actually leaves the worker. */
export const scheduleCustomerRemoval = ({
	current,
	now,
}: {
	current: RolloutCustomer;
	now: number;
}): RolloutCustomer =>
	current.removedAt === undefined ? { ...current, removedAt: now } : current;

const removalExpired = ({
	customer,
	now,
}: {
	customer: RolloutCustomer;
	now: number;
}): boolean =>
	customer.removedAt !== undefined &&
	now >=
		rolloutEffectiveAt({ changedAt: customer.removedAt }) +
			STALENESS_RETENTION_MS;

/** Drops removed customers once no pre-removal Redis view can remain, and orgs left with none. */
export const pruneExpiredCustomerRemovals = ({
	customers,
	now,
}: {
	customers: RolloutEntry["customers"];
	now: number;
}): RolloutEntry["customers"] => {
	const pruned: RolloutEntry["customers"] = {};
	for (const [orgId, orgCustomers] of Object.entries(customers)) {
		const kept = Object.entries(orgCustomers).filter(
			([, customer]) => !removalExpired({ customer, now }),
		);
		if (kept.length > 0) pruned[orgId] = Object.fromEntries(kept);
	}
	return pruned;
};

const writeRolloutCustomers = async ({
	rolloutId,
	orgId,
	customerIds,
	now,
	schedule,
}: {
	rolloutId: string;
	orgId: string;
	customerIds: string[];
	now: number;
	schedule: (
		current: RolloutCustomer | undefined,
	) => RolloutCustomer | undefined;
}) => {
	const config = await store.readFromSource();
	const entry = config.rollouts[rolloutId] ?? emptyRolloutEntry();

	const orgCustomers = { ...entry.customers[orgId] };
	for (const customerId of customerIds) {
		const scheduled = schedule(orgCustomers[customerId]);
		if (scheduled) orgCustomers[customerId] = scheduled;
	}
	entry.customers = pruneExpiredCustomerRemovals({
		customers: { ...entry.customers, [orgId]: orgCustomers },
		now,
	});

	config.rollouts[rolloutId] = entry;
	await store.writeToSource({ config });

	return config;
};

/** Pin customers of one org to the worker, one settle window from now. */
export const addRolloutCustomers = async ({
	rolloutId,
	orgId,
	customerIds,
	now = Date.now(),
}: {
	rolloutId: string;
	orgId: string;
	customerIds: string[];
	now?: number;
}) =>
	writeRolloutCustomers({
		rolloutId,
		orgId,
		customerIds,
		now,
		schedule: (current) => scheduleCustomerAdd({ current, now }),
	});

/** Unpin customers of one org: they follow the org or global percent again one settle window from now. */
export const removeRolloutCustomers = async ({
	rolloutId,
	orgId,
	customerIds,
	now = Date.now(),
}: {
	rolloutId: string;
	orgId: string;
	customerIds: string[];
	now?: number;
}) =>
	writeRolloutCustomers({
		rolloutId,
		orgId,
		customerIds,
		now,
		schedule: (current) =>
			current ? scheduleCustomerRemoval({ current, now }) : undefined,
	});

/** Deleting an entry skips the handoff, so a live rollout is rolled back to 0 first, then deleted. */
export const assertRolloutInactive = ({
	rolloutId,
	entry,
}: {
	rolloutId: string;
	entry: RolloutEntry | undefined;
}): void => {
	if (!entry) return;
	const percentActive = [entry, ...Object.values(entry.orgs)].some(
		({ percent }) => percent > 0,
	);
	const customerPinned = Object.values(entry.customers).some((orgCustomers) =>
		Object.values(orgCustomers).some(
			({ removedAt }) => removedAt === undefined,
		),
	);
	if (!percentActive && !customerPinned) return;
	throw new RecaseError({
		message: `Rollout ${rolloutId} is still active; set every percent to 0 and remove every customer before deleting it`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

/**
 * Delete a rollout entry entirely. Use this instead of setting percent to 0
 * when you want to reset the staleness window (previousPercent/changedAt).
 */
export const deleteRollout = async ({ rolloutId }: { rolloutId: string }) => {
	const config = await store.readFromSource();
	assertRolloutInactive({ rolloutId, entry: config.rollouts[rolloutId] });
	delete config.rollouts[rolloutId];
	await store.writeToSource({ config });
	return config;
};
