import { ms } from "@autumn/shared";
import { ADMIN_REDIS_TIMEOUT_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type RedisTimeoutConfig,
	RedisTimeoutConfigSchema,
} from "./redisTimeoutSchemas.js";

const store = createEdgeConfigStore<RedisTimeoutConfig>({
	s3Key: ADMIN_REDIS_TIMEOUT_CONFIG_KEY,
	schema: RedisTimeoutConfigSchema,
	defaultValue: () => ({ commandTimeoutMs: 500 }),
	pollIntervalMs: ms.seconds(10),
});

registerEdgeConfig({ store });

/**
 * Returns the currently configured Redis command timeout in milliseconds, or
 * `null` if no timeout is configured.
 *
 * Note: ioredis's `commandTimeout` option is fixed at client construction —
 * this value is read by `createRedisClient` at startup. Changes to the edge
 * config won't apply to existing connections until pods restart. If you need
 * a lower timeout immediately, enforce it at a higher layer (e.g. `runRedisOp`).
 */
export const getRedisCommandTimeoutMs = (): number | null =>
	store.get().commandTimeoutMs;

export const getRedisTimeoutStatus = () => store.getStatus();

export const updateRedisCommandTimeoutMs = async ({
	commandTimeoutMs,
}: {
	commandTimeoutMs: number | null;
}) => {
	await store.writeToSource({ config: { commandTimeoutMs } });
};

/** Test-only: override the in-memory timeout without writing to S3. */
export const _setRedisCommandTimeoutMsForTesting = ({
	commandTimeoutMs,
}: {
	commandTimeoutMs: number | null;
}) => {
	store._setRuntimeConfigForTesting({ commandTimeoutMs });
};
