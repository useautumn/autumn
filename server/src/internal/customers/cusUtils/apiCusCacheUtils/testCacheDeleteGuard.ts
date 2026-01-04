import { logger } from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";

/**
 * Builds the test cache delete guard key (matches Lua function)
 */
const buildTestCacheDeleteGuardKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => `{${orgId}}:${env}:test_cache_delete_guard:${customerId}`;

/**
 * Sets a test cache delete guard to prevent cache deletion during testing.
 * When this guard exists, deleteCustomer.lua will skip deletion.
 */
export const setTestCacheDeleteGuard = async ({
	ctx,
	customerId,
	ttlMs = 60000, // Default 60 seconds
}: {
	ctx: AutumnContext;
	customerId: string;
	ttlMs?: number;
}): Promise<boolean> => {
	const key = buildTestCacheDeleteGuardKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});
	try {
		await redis.set(key, "1", "PX", ttlMs);
		return true;
	} catch (error) {
		logger.error(`Failed to set test cache delete guard: ${error}`);
		return false;
	}
};

/**
 * Removes the test cache delete guard.
 */
export const removeTestCacheDeleteGuard = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<boolean> => {
	const key = buildTestCacheDeleteGuardKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});
	try {
		await redis.del(key);
		return true;
	} catch (error) {
		logger.error(`Failed to remove test cache delete guard: ${error}`);
		return false;
	}
};
