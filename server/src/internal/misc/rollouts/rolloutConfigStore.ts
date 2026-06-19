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

/**
 * Isolated test environments (`bun tw` µVMs) have NO AWS creds, so the
 * S3-backed edge config can't be read and `store.get()` returns an empty
 * rollout. An empty rollout silently DISABLES the v2-cache (fullSubject) path
 * and falls the server back to legacy cache-v1 semantics — which breaks every
 * test that asserts atomic v2 deduction (e.g. N concurrent checks must allow
 * exactly the granted balance, not all N).
 *
 * `TW_FORCE_FULL_SUBJECT_ROLLOUT=1` forces the `v2-cache` rollout to 100% so the
 * server deterministically uses cache v2 — the production default for months —
 * without any S3/edge-config dependency. Off by default: production and normal
 * dev read the real config from S3 untouched. Mirrors FULL_SUBJECT_ROLLOUT_ID
 * ("v2-cache") in fullSubjectRolloutUtils (inlined here to avoid an import cycle).
 */
const FORCE_FULL_SUBJECT_ROLLOUT = ["1", "true", "yes"].includes(
	(process.env.TW_FORCE_FULL_SUBJECT_ROLLOUT ?? "").trim().toLowerCase(),
);

const FORCED_ROLLOUT_CONFIG: RolloutConfig = {
	rollouts: {
		"v2-cache": {
			percent: 100,
			previousPercent: 100,
			changedAt: 0,
			orgs: {},
		},
	},
};

export const getRolloutConfig = (): RolloutConfig =>
	FORCE_FULL_SUBJECT_ROLLOUT ? FORCED_ROLLOUT_CONFIG : store.get();
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

/**
 * Delete a rollout entry entirely. Use this instead of setting percent to 0
 * when you want to reset the staleness window (previousPercent/changedAt)
 * without triggering cache invalidation for affected customers.
 */
export const deleteRollout = async ({ rolloutId }: { rolloutId: string }) => {
	const config = await store.readFromSource();
	delete config.rollouts[rolloutId];
	await store.writeToSource({ config });
	return config;
};
