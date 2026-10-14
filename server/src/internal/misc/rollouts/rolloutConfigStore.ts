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
export const rolloutEdgeConfig = store;
export const _setRolloutConfigForTesting = ({
	config,
}: {
	config: z.input<typeof RolloutConfigSchema>;
}) => store._setRuntimeConfigForTesting(RolloutConfigSchema.parse(config));

const STALENESS_RETENTION_MS = FULL_SUBJECT_CACHE_TTL_SECONDS * 1000;

const emptyRolloutEntry = (): RolloutEntry => ({
	percent: 0,
	previousPercent: 0,
	changedAt: 0,
	decreases: [],
	orgs: {},
	customers: {},
});

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

export const deleteRollout = async ({ rolloutId }: { rolloutId: string }) => {
	const config = await store.readFromSource();
	assertRolloutInactive({ rolloutId, entry: config.rollouts[rolloutId] });
	delete config.rollouts[rolloutId];
	await store.writeToSource({ config });
	return config;
};
