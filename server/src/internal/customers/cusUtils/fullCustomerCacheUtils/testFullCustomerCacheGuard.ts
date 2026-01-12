import { logger } from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/**
 * Builds the test cache delete guard key for fullCustomer cache
 */
export const buildTestFullCustomerCacheGuardKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => `{${orgId}}:${env}:test_full_customer_cache_guard:${customerId}`;

/**
 * Sets a test cache delete guard to prevent fullCustomer cache deletion during testing.
 * When this guard exists, deleteCachedFullCustomer will skip deletion.
 */
export const setTestFullCustomerCacheGuard = async ({
	ctx,
	customerId,
	ttlMs = 60000, // Default 60 seconds
}: {
	ctx: AutumnContext;
	customerId: string;
	ttlMs?: number;
}): Promise<boolean> => {
	const key = buildTestFullCustomerCacheGuardKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});
	try {
		await redis.set(key, "1", "PX", ttlMs);
		return true;
	} catch (error) {
		logger.error(`Failed to set test fullCustomer cache guard: ${error}`);
		return false;
	}
};

/**
 * Removes the test fullCustomer cache delete guard.
 */
export const removeTestFullCustomerCacheGuard = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<boolean> => {
	const key = buildTestFullCustomerCacheGuardKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});
	try {
		await redis.del(key);
		return true;
	} catch (error) {
		logger.error(`Failed to remove test fullCustomer cache guard: ${error}`);
		return false;
	}
};
