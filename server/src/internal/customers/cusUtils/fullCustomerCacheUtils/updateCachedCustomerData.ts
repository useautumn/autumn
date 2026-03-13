import type { Customer } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { deleteCachedFullCustomer } from "./deleteCachedFullCustomer.js";
import { buildFullCustomerCacheKey } from "./fullCustomerCacheConfig.js";

type UpdateCustomerDataResult = {
	success: boolean;
	updatedFields: string[];
	cacheMiss?: boolean;
};

type CustomerDataUpdates = Pick<
	Partial<Customer>,
	| "name"
	| "email"
	| "fingerprint"
	| "metadata"
	| "send_email_receipts"
	| "processor"
	| "processors"
	| "auto_topups"
	| "spend_limits"
>;

/**
 * Update customer data fields in the Redis cache atomically using JSON.SET.
 * Only updates fields that are present in the update object.
 */
export const updateCachedCustomerData = async ({
	ctx,
	customerId,
	newCustomerId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	newCustomerId?: string;
	updates: CustomerDataUpdates;
}): Promise<UpdateCustomerDataResult | null> => {
	try {
		const { org, env, logger } = ctx;

		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId,
		});

		if (newCustomerId && newCustomerId !== customerId) {
			await deleteCachedFullCustomer({
				ctx,
				customerId,
				source: "updateCachedCustomerData (ID changed)",
			});
			return { success: true, updatedFields: ["id"] };
		}

		if (Object.keys(updates).length === 0) {
			return { success: true, updatedFields: [] };
		}

		const paramsJson = JSON.stringify({ updates });

		const result = await tryRedisWrite(async () => {
			return await redis.updateCustomerData(cacheKey, paramsJson);
		});

		if (result === null) {
			logger.warn(
				`[updateCachedCustomerData] Redis write failed for ${customerId}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			success: boolean;
			updated_fields?: string[];
			cache_miss?: boolean;
		};

		logger.info(
			`[updateCachedCustomerData] ${customerId}: success=${parsed.success}, fields=${parsed.updated_fields?.join(",")}`,
		);

		return {
			success: parsed.success,
			updatedFields: parsed.updated_fields || [],
			cacheMiss: parsed.cache_miss,
		};
	} catch (error) {
		ctx.logger.error(
			`[updateCachedCustomerData] ${customerId}: error, error: ${error}`,
		);
		return null;
	}
};
