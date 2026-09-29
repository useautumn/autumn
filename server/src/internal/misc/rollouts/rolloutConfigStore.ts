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
	type RolloutEntry,
	type RolloutPercent,
} from "./rolloutSchemas.js";
import { routingPercentAt } from "./rolloutUtils.js";

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

// No Redis view outlives its TTL, so a decrease older than that cannot mark one stale.
const DECREASE_RETENTION_MS = FULL_SUBJECT_CACHE_TTL_SECONDS * 1000;

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
		({ at }) => at > now - DECREASE_RETENTION_MS,
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

	const entry: RolloutEntry = config.rollouts[rolloutId] ?? {
		percent: 0,
		previousPercent: 0,
		changedAt: 0,
		decreases: [],
		orgs: {},
	};

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

/** Deleting an entry skips the handoff, so a live rollout is rolled back to 0 first, then deleted. */
export const assertRolloutInactive = ({
	rolloutId,
	entry,
}: {
	rolloutId: string;
	entry: RolloutEntry | undefined;
}): void => {
	if (!entry) return;
	const active = [entry, ...Object.values(entry.orgs)].some(
		({ percent }) => percent > 0,
	);
	if (!active) return;
	throw new RecaseError({
		message: `Rollout ${rolloutId} is still active; set every percent to 0 before deleting it`,
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
