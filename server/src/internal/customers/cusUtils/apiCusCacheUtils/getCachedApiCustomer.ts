import {
	type ApiCustomer,
	ApiCustomerSchema,
	type AppEnv,
	type CustomerLegacyData,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import { CACHE_CUSTOMER_VERSION } from "@lua/cacheConfig.js";
import { GET_CUSTOMER_SCRIPT } from "@lua/luaScripts.js";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	normalizeCachedData,
	tryRedisRead,
} from "../../../../utils/cacheUtils/cacheUtils.js";
import { CusService } from "../../CusService.js";
import { getApiCustomerBase } from "../apiCusUtils/getApiCustomerBase.js";
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
	return `{${orgId}}:${env}:customer:${CACHE_CUSTOMER_VERSION}:${customerId}`;
};

/**
 * Get ApiCustomer from Redis cache
 * If not found, fetch from DB, cache it, and return
 * If skipCache is true, always fetch from DB
 */
export const getCachedApiCustomer = async ({
	ctx,
	customerId,
	skipCache = false,
	skipEntityMerge = false,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	skipCache?: boolean;
	skipEntityMerge?: boolean; // If true, returns only customer's own features (no entity merging)
	source?: string;
}): Promise<{ apiCustomer: ApiCustomer; legacyData: CustomerLegacyData }> => {
	const { org, env, db } = ctx;

	// Try to get from cache using Lua script (unless skipCache is true)
	if (!skipCache) {
		const cachedResult = await tryRedisRead(() =>
			redis.eval(
				GET_CUSTOMER_SCRIPT,
				0, // No KEYS, all params in ARGV
				org.id,
				env,
				customerId,
				skipEntityMerge ? "true" : "false",
			),
		);

		if (cachedResult) {
			const cached = normalizeCachedData(
				JSON.parse(cachedResult as string) as ApiCustomer & {
					legacyData: CustomerLegacyData;
				},
			);

			const { legacyData, ...rest } = cached;

			return {
				// ← This returns from getCachedApiCustomer!
				apiCustomer: ApiCustomerSchema.parse(rest),
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
		withEntities: true,
		withSubs: true,
	});

	// Build ApiCustomer (base only, no expand) to return
	const { apiCustomer, legacyData } = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: true,
	});

	const { apiCustomer: masterApiCustomer } = await getApiCustomerBase({
		ctx,
		fullCus: {
			...fullCus,
			customer_products: filterOutEntitiesFromCusProducts({
				cusProducts: fullCus.customer_products,
			}),
		},
		withAutumnId: true,
	});

	// Store customer and entity caches (only if not skipping cache)
	if (!skipCache) {
		await setCachedApiCustomer({
			ctx,
			fullCus,
			customerId,
			source,
		});
	}

	return {
		apiCustomer: ApiCustomerSchema.parse(
			skipEntityMerge ? masterApiCustomer : apiCustomer,
		),
		legacyData,
	};
};
