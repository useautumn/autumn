import { ms } from "@autumn/shared";
import { ADMIN_REDIS_V2_CACHE_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type RedisV2CacheConfig,
	RedisV2CacheConfigSchema,
	type RedisV2InstanceName,
} from "./redisV2CacheSchemas.js";

const store = createEdgeConfigStore<RedisV2CacheConfig>({
	s3Key: ADMIN_REDIS_V2_CACHE_CONFIG_KEY,
	schema: RedisV2CacheConfigSchema,
	defaultValue: () => ({ activeInstance: "upstash" }),
	pollIntervalMs: ms.seconds(10),
});

registerEdgeConfig({ store });

export const getActiveRedisV2Instance = (): RedisV2InstanceName =>
	store.get().activeInstance;

export const getRedisV2CacheStatus = () => store.getStatus();

export const updateActiveRedisV2Instance = async ({
	activeInstance,
}: {
	activeInstance: RedisV2InstanceName;
}) => {
	await store.writeToSource({ config: { activeInstance } });
};

/** Test-only: override the in-memory active instance without writing to S3. */
export const _setActiveRedisV2InstanceForTesting = ({
	activeInstance,
}: {
	activeInstance: RedisV2InstanceName;
}) => {
	store._setRuntimeConfigForTesting({ activeInstance });
};
