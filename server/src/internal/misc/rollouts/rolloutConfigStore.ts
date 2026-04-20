import { ADMIN_ROLLOUT_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type RolloutConfig,
	RolloutConfigSchema,
	type RolloutPercent,
} from "./rolloutSchemas.js";

const store = createEdgeConfigStore<RolloutConfig>({
	s3Key: ADMIN_ROLLOUT_CONFIG_KEY,
	schema: RolloutConfigSchema,
	defaultValue: () => ({ rollouts: {} }),
});

registerEdgeConfig({ store });

export const getRolloutConfig = () => store.get();
export const getRolloutConfigStatus = () => store.getStatus();
export const getRolloutConfigFromSource = async () => store.readFromSource();

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
