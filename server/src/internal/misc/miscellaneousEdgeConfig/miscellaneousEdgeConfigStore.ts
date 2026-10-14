import type { AppEnv } from "@autumn/shared";
import { ADMIN_MISCELLANEOUS_EDGE_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type MiscellaneousEdgeConfig,
	MiscellaneousEdgeConfigSchema,
} from "./miscellaneousEdgeConfigSchemas.js";

const store = createEdgeConfigStore<MiscellaneousEdgeConfig>({
	s3Key: ADMIN_MISCELLANEOUS_EDGE_CONFIG_KEY,
	schema: MiscellaneousEdgeConfigSchema,
	defaultValue: () => MiscellaneousEdgeConfigSchema.parse({}),
});

registerEdgeConfig({ store });

export const getRuntimeMiscellaneousEdgeConfigStatus = () => store.getStatus();

export const getRuntimeMiscellaneousEdgeConfig = (): MiscellaneousEdgeConfig =>
	store.get();

export const isOnNewFlatCusModel = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: AppEnv;
	customerId: string;
}): boolean => {
	const config = store.get();
	const key = `${orgId}:${env}:${customerId}`;
	return config.newFlatCusModel.includes(key);
};

export const getMiscellaneousEdgeConfigFromSource =
	async (): Promise<MiscellaneousEdgeConfig> => store.readFromSource();

export const updateFullMiscellaneousEdgeConfig = async ({
	config,
}: {
	config: MiscellaneousEdgeConfig;
}): Promise<void> => {
	await store.writeToSource({ config });
};

export const _setMiscellaneousEdgeConfigForTesting = ({
	config,
}: {
	config: MiscellaneousEdgeConfig;
}): void => {
	store._setRuntimeConfigForTesting(config);
};

export const isExpiredGrantCleanupEnabled = (): boolean =>
	store.get().expiredGrantCleanup;

export const isSyncCoalesceEnabled = (): boolean => store.get().syncCoalesce;

export const isSubjectLookupDbOnlyEnabled = (): boolean =>
	store.get().subjectLookupDbOnly;

export const isIdempotencyDynamoReadEnabled = (): boolean =>
	store.get().idempotencyDynamoRead;
export const isRedisFallbackToDbEnabled = (): boolean =>
	store.get().redisFallbackToDb;

export const isSubjectReadSingleflightEnabled = (): boolean =>
	store.get().subjectReadSingleflight;

export const isMotherduckCacheRefreshDisabled = (): boolean =>
	store.get().disableMotherduckCacheRefresh;

export const isAxiomResponseBodyReductionEnabled = (): boolean =>
	store.get().axiomResponseBodyReduction;
