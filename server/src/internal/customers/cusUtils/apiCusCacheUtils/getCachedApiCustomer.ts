import type { ApiCustomer, AppEnv } from "@autumn/shared";
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
 */
export const getCachedApiCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<ApiCustomer> => {
	const { org, env, db } = ctx;

	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId: org.id,
		env,
	});

	// Try to get from cache using Lua script
	const cachedResult = await redis.eval(
		GET_CUSTOMER_SCRIPT,
		1, // number of keys
		cacheKey, // KEYS[1]
	);

	// If found in cache, parse and return
	if (cachedResult) {
		const customer = JSON.parse(cachedResult as string) as ApiCustomer;
		return customer;
	}

	// Cache miss - fetch from DB
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
	const apiCustomer = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: false,
	});

	// Store in cache using Lua script
	await redis.eval(
		SET_CUSTOMER_SCRIPT,
		1, // number of keys
		cacheKey, // KEYS[1]
		JSON.stringify(apiCustomer), // ARGV[1]
	);

	return apiCustomer;
};
