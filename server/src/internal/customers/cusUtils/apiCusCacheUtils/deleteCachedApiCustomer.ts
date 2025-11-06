import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redis } from "@/external/redis/initRedis.js";
import { buildCachedApiCustomerKey } from "./getCachedApiCustomer.js";

const DELETE_CUSTOMER_SCRIPT = readFileSync(
	join(import.meta.dir, "deleteCustomer.lua"),
	"utf-8",
);

/**
 * Delete all cached ApiCustomer data from Redis
 * This includes the base customer key and all related feature/breakdown/rollover keys
 * Also deletes all associated entity caches atomically using Lua script
 */
export const deleteCachedApiCustomer = async ({
	customerId,
	orgId,
	env,
}: {
	customerId: string;
	orgId: string;
	env: string;
}): Promise<void> => {
	if (redis.status !== "ready") {
		console.warn("❗️ Redis not ready, skipping cache deletion", {
			status: redis.status,
			customerId,
		});
		return;
	}

	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId,
		env,
	});

	try {
		const deletedCount = await redis.eval(
			DELETE_CUSTOMER_SCRIPT,
			1,
			cacheKey, // The base pattern: {orgId}:env:customer:customerId
		);

		console.log(
			`🗑️ Deleted ${deletedCount} cache keys for customer ${customerId}`,
		);
	} catch (error) {
		console.error("Error deleting customer with entities:", error);
		throw error;
	}
};
