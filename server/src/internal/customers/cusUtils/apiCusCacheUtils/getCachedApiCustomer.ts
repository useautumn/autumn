import {
	type ApiCustomer,
	ApiCustomerSchema,
	type AppEnv,
	type CustomerLegacyData,
} from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { CusService } from "../../CusService.js";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import { getApiCustomerBase } from "../apiCusUtils/getApiCustomerBase.js";
import { GET_CUSTOMER_SCRIPT, SET_CUSTOMER_SCRIPT } from "./luaScripts.js";

export const buildCachedApiCustomerKey = ({
	customerId,
	orgId,
	env,
}: {
	customerId: string;
	orgId: string;
	env: string;
}) => {
	return `${orgId}:${env}:customer:${customerId}`;
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
	const { org, env, db } = ctx;

	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId: org.id,
		env,
	});

	// Try to get from cache using Lua script (unless skipCache is true)
	if (!skipCache) {
		const cachedResult = await redis.eval(
			GET_CUSTOMER_SCRIPT,
			1, // number of keys
			cacheKey, // KEYS[1]
		);

		// If found in cache, parse and return
		if (cachedResult) {
			const cached = JSON.parse(cachedResult as string) as ApiCustomer & {
				legacyData: CustomerLegacyData;
			};

			// Extract legacyData and reconstruct apiCustomer with correct key order
			const { legacyData, ...rest } = cached;

			return {
				apiCustomer: ApiCustomerSchema.parse({
					...rest,
					autumn_id: withAutumnId ? customerId : undefined,
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
		withEntities: false,
		withSubs: true,
	});

	// Build ApiCustomer (base only, no expand)
	const { apiCustomer, legacyData } = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: !skipCache,
	});

	// Store in cache (only if not skipping cache)
	if (!skipCache) {
		await redis.eval(
			SET_CUSTOMER_SCRIPT,
			1, // number of keys
			cacheKey, // KEYS[1]
			JSON.stringify({ ...apiCustomer, legacyData }), // ARGV[1]
		);
	}

	return {
		apiCustomer: ApiCustomerSchema.parse({
			...apiCustomer,
			autumn_id: withAutumnId ? fullCus.internal_id : undefined,
		}),
		legacyData,
	};
};
