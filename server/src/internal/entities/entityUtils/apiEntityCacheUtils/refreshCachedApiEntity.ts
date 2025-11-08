import type { ApiEntity, AppEnv } from "@autumn/shared";
import { SET_ENTITY_SCRIPT } from "@lua/luaScripts.js";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getApiEntityBase } from "../apiEntityUtils/getApiEntityBase.js";
import { buildCachedApiEntityKey } from "./getCachedApiEntity.js";

/**
 * Refresh ApiEntity in Redis cache by fetching fresh data from DB
 */
export const refreshCachedApiEntity = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
}): Promise<{ apiEntity: ApiEntity }> => {
	const { org, env, db } = ctx;

	const cacheKey = buildCachedApiEntityKey({
		entityId,
		customerId,
		orgId: org.id,
		env,
	});

	// Fetch fresh entity from DB
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env: env as AppEnv,
		inStatuses: RELEVANT_STATUSES,
		withEntities: true,
		withSubs: true,
		entityId,
	});

	const entity = fullCus.entity;
	if (!entity) {
		throw new Error(`Entity ${entityId} not found`);
	}

	// Build fresh ApiEntity
	const { apiEntity } = await getApiEntityBase({
		ctx,
		entity,
		fullCus,
		withAutumnId: false,
	});

	// Update cache with fresh data using Lua script
	await redis.eval(
		SET_ENTITY_SCRIPT,
		1, // number of keys
		cacheKey, // KEYS[1]
		JSON.stringify(apiEntity), // ARGV[1]
	);

	return {
		apiEntity,
	};
};
