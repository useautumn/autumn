import { ErrCode } from "@autumn/shared";
import { ADMIN_ROLLOUT_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import RecaseError from "@/utils/errorUtils.js";
import {
	type RolloutConfig,
	RolloutConfigSchema,
	type RolloutEntry,
	type RolloutPercent,
} from "./rolloutSchemas.js";

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
export const _setRolloutConfigForTesting = ({
	config,
}: {
	config: RolloutConfig;
}) => store._setRuntimeConfigForTesting(config);

/**
 * Update a rollout percentage (global or per-org). Auto-manages
 * previousPercent and changedAt for cache staleness tracking.
 */
export const updateRolloutPercent = async ({
	rolloutId,
	orgId,
	percent,
}: {
	rolloutId: string;
	orgId?: string;
	percent: number;
}) => {
	const config = await store.readFromSource();

	const entry = config.rollouts[rolloutId] ?? {
		percent: 0,
		previousPercent: 0,
		changedAt: 0,
		orgs: {},
	};

	if (orgId) {
		const orgEntry: RolloutPercent = entry.orgs[orgId] ?? {
			percent: 0,
			previousPercent: 0,
			changedAt: 0,
		};
		entry.orgs[orgId] = {
			previousPercent: orgEntry.percent,
			percent,
			changedAt: Date.now(),
		};
	} else {
		entry.previousPercent = entry.percent;
		entry.percent = percent;
		entry.changedAt = Date.now();
	}

	config.rollouts[rolloutId] = entry;
	await store.writeToSource({ config });

	return config;
};

/** Remove an org override from a rollout. */
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
