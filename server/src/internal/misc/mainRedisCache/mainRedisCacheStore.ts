import { ms } from "@autumn/shared";
import { ADMIN_MAIN_REDIS_CACHE_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type MainRedisCacheConfig,
	MainRedisCacheConfigSchema,
	type MainRedisInstanceName,
} from "./mainRedisCacheSchemas.js";

const store = createEdgeConfigStore<MainRedisCacheConfig>({
	s3Key: ADMIN_MAIN_REDIS_CACHE_CONFIG_KEY,
	schema: MainRedisCacheConfigSchema,
	defaultValue: () => ({ activeInstance: "primary" }),
	pollIntervalMs: ms.seconds(10),
});

registerEdgeConfig({ store });

export const getActiveMainRedisInstance = (): MainRedisInstanceName =>
	store.get().activeInstance;

export const getMainRedisCacheStatus = () => store.getStatus();

export const updateActiveMainRedisInstance = async ({
	activeInstance,
}: {
	activeInstance: MainRedisInstanceName;
}) => {
	await store.writeToSource({ config: { activeInstance } });
};

export const _setActiveMainRedisInstanceForTesting = ({
	activeInstance,
}: {
	activeInstance: MainRedisInstanceName;
}) => {
	store._setRuntimeConfigForTesting({ activeInstance });
};
