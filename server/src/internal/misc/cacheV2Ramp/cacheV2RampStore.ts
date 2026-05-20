import { ms } from "@autumn/shared";
import { ADMIN_CACHE_V2_RAMP_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type CacheV2RampConfig,
	CacheV2RampConfigSchema,
	type RampDestination,
} from "./cacheV2RampSchemas.js";

const store = createEdgeConfigStore<CacheV2RampConfig>({
	s3Key: ADMIN_CACHE_V2_RAMP_CONFIG_KEY,
	schema: CacheV2RampConfigSchema,
	defaultValue: () => ({
		destination: null,
		percent: 0,
		previousPercent: 0,
		changedAt: 0,
		orgs: {},
	}),
	pollIntervalMs: ms.seconds(10),
});

registerEdgeConfig({ store });

export const getCacheV2RampConfig = (): CacheV2RampConfig => store.get();

export const getCacheV2RampStatus = () => store.getStatus();

export const updateCacheV2RampPercent = async ({
	percent,
	orgId,
}: {
	percent: number;
	orgId?: string;
}) => {
	const current = await store.readFromSource();
	const now = Date.now();

	if (orgId) {
		const existingOrg = current.orgs[orgId];
		const nextOrgs = {
			...current.orgs,
			[orgId]: {
				percent,
				previousPercent: existingOrg?.percent ?? 0,
				changedAt: now,
			},
		};
		await store.writeToSource({ config: { ...current, orgs: nextOrgs } });
		return;
	}

	await store.writeToSource({
		config: {
			...current,
			percent,
			previousPercent: current.percent,
			changedAt: now,
		},
	});
};

export const removeCacheV2RampOrg = async ({ orgId }: { orgId: string }) => {
	const current = await store.readFromSource();
	if (!current.orgs[orgId]) return;
	const { [orgId]: _removed, ...rest } = current.orgs;
	await store.writeToSource({ config: { ...current, orgs: rest } });
};

/** Write the destination URL + encrypted connection string. Pass null to clear. */
export const updateCacheV2RampDestination = async ({
	destination,
}: {
	destination: RampDestination | null;
}) => {
	const current = await store.readFromSource();
	await store.writeToSource({ config: { ...current, destination } });
};

/** Test-only: override the in-memory config without writing to S3. */
export const _setCacheV2RampConfigForTesting = (
	config: Partial<CacheV2RampConfig>,
) => {
	store._setRuntimeConfigForTesting({
		destination: null,
		percent: 0,
		previousPercent: 0,
		changedAt: 0,
		orgs: {},
		...config,
	});
};
