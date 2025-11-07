import {
	type ApiCustomer,
	ApiCustomerSchema,
	type AppEnv,
	type CustomerLegacyData,
} from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	normalizeCachedData,
	tryRedisRead,
} from "../../../../utils/cacheUtils/cacheUtils.js";
import { CusService } from "../../CusService.js";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import { getApiCustomerBase } from "../apiCusUtils/getApiCustomerBase.js";
import { GET_CUSTOMER_SCRIPT } from "./cusLuaScripts/luaScripts.js";
import { setCachedApiCustomer } from "./setCachedApiCustomer.js";

export const buildCachedApiCustomerKey = ({
	customerId,
	orgId,
	env,
}: {
	customerId: string;
	orgId: string;
	env: string;
}) => {
	return `{${orgId}}:${env}:customer:${customerId}`;
};

/**
 * Get ApiCustomer from Redis cache
 * If not found, fetch from DB, cache it, and return
 * If skipCache is true, always fetch from DB
 */
export const getCachedApiCustomer = async ({
	ctx,
	customerId,
	withAutumnId = false,
	skipCache = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	withAutumnId?: boolean;
	skipCache?: boolean;
}): Promise<{ apiCustomer: ApiCustomer; legacyData: CustomerLegacyData }> => {
	const { org, env, db, logger } = ctx;

	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId: org.id,
		env,
	});

	// Try to get from cache using Lua script (unless skipCache is true)
	if (!skipCache) {
		const cachedResult = await tryRedisRead(() =>
			redis.eval(GET_CUSTOMER_SCRIPT, 1, cacheKey, org.id, env, customerId),
		);

		if (cachedResult) {
			const cached = normalizeCachedData(
				JSON.parse(cachedResult as string) as ApiCustomer & {
					legacyData: CustomerLegacyData;
				},
			);

			const { legacyData, ...rest } = cached;

			// logger.info(`Customer cache hit:`, rest.features);

			return {
				// ← This returns from getCachedApiCustomer!
				apiCustomer: ApiCustomerSchema.parse({
					...rest,
					autumn_id: withAutumnId ? rest.autumn_id : undefined,
				}),
				legacyData,
			};
		}
	}

	// Cache miss or skipCache - fetch from DB

	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env: env as AppEnv,
		inStatuses: RELEVANT_STATUSES,
		withEntities: true,
		withSubs: true,
	});

	// Build ApiCustomer (base only, no expand) to return
	const { apiCustomer, legacyData } = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: true,
	});

	// Store customer and entity caches (only if not skipping cache)
	if (!skipCache) {
		await setCachedApiCustomer({
			ctx,
			fullCus,
			customerId,
		});
	}

	return {
		apiCustomer: ApiCustomerSchema.parse(apiCustomer),
		legacyData,
	};
};
