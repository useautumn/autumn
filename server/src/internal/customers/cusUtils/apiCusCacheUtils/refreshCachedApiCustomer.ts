import type { ApiCustomer, AppEnv, CustomerLegacyData } from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { CusService } from "../../CusService.js";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import { getApiCustomerBase } from "../apiCusUtils/getApiCustomerBase.js";
import { buildCachedApiCustomerKey } from "./getCachedApiCustomer.js";
import { SET_CUSTOMER_SCRIPT } from "./luaScripts.js";

/**
 * Refresh ApiCustomer in Redis cache by fetching fresh data from DB
 */
export const refreshCachedApiCustomer = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
}): Promise<{ apiCustomer: ApiCustomer; legacyData: CustomerLegacyData }> => {
	const { org, env, db } = ctx;

	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId: org.id,
		env,
	});

	// Fetch fresh customer from DB
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env: env as AppEnv,
		inStatuses: RELEVANT_STATUSES,
		withEntities: false,
		withSubs: true,
		entityId,
	});

	// Build fresh ApiCustomer
	const { apiCustomer, legacyData } = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: false,
	});

	// Update cache with fresh data using Lua script
	await redis.eval(
		SET_CUSTOMER_SCRIPT,
		1, // number of keys
		cacheKey, // KEYS[1]
		JSON.stringify({ ...apiCustomer, legacyData }), // ARGV[1]
		org.id, // ARGV[2]
		env, // ARGV[3]
	);

	return {
		apiCustomer,
		legacyData,
	};
};
