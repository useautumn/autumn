import { ms } from "@autumn/shared";
import { ADMIN_CACHE_V2_RAMP_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type CacheV2RampConfig,
	CacheV2RampConfigSchema,
} from "./cacheV2RampSchemas.js";

const store = createEdgeConfigStore<CacheV2RampConfig>({
	s3Key: ADMIN_CACHE_V2_RAMP_CONFIG_KEY,
	schema: CacheV2RampConfigSchema,
	defaultValue: () => null,
	pollIntervalMs: ms.seconds(10),
});

registerEdgeConfig({ store });

export const getCacheV2RampConfig = (): CacheV2RampConfig => store.get();

export const getCacheV2RampStatus = () => store.getStatus();

/** Create-or-update the connection details. Preserves migration state if a
 *  config already exists; initializes with migrationPercent=0 otherwise. */
export const upsertCacheV2RampConnection = async ({
	connectionString,
	url,
}: {
	connectionString: string;
	url: string;
}) => {
	const current = await store.readFromSource();
	const now = Date.now();
	const next: CacheV2RampConfig = current
		? { ...current, connectionString, url }
		: {
				connectionString,
				url,
				migrationPercent: 0,
				previousMigrationPercent: 0,
				migrationChangedAt: now,
			};
	await store.writeToSource({ config: next });
};

export const updateCacheV2RampMigrationPercent = async ({
	migrationPercent,
}: {
	migrationPercent: number;
}) => {
	const current = await store.readFromSource();
	if (!current) {
		throw new Error(
			"No cache V2 ramp config set. Configure destination first.",
		);
	}
	await store.writeToSource({
		config: {
			...current,
			previousMigrationPercent: current.migrationPercent,
			migrationPercent,
			migrationChangedAt: Date.now(),
		},
	});
};

export const removeCacheV2RampConfig = async () => {
	await store.writeToSource({ config: null });
};

/** Test-only: override the in-memory config without writing to S3. */
export const _setCacheV2RampConfigForTesting = (config: CacheV2RampConfig) => {
	store._setRuntimeConfigForTesting(config);
};
