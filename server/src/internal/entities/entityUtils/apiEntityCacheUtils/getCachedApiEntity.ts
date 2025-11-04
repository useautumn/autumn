import {
	type ApiEntity,
	ApiEntitySchema,
	type AppEnv,
	filterEntityLevelCusProducts,
} from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { normalizeCachedData } from "@/utils/cacheUtils/cacheUtils.js";
import { getApiEntityBase } from "../apiEntityUtils/getApiEntityBase.js";
import { GET_ENTITY_SCRIPT, SET_ENTITY_SCRIPT } from "./luaScripts.js";

export const buildCachedApiEntityKey = ({
	entityId,
	orgId,
	env,
}: {
	entityId: string;
	orgId: string;
	env: string;
}) => {
	return `${orgId}:${env}:entity:${entityId}`;
};

/**
 * Get ApiEntity from Redis cache
 * If not found, fetch from DB, cache it, and return
 * If skipCache is true, always fetch from DB
 */
export const getCachedApiEntity = async ({
	ctx,
	customerId,
	entityId,
	withAutumnId = false,
	skipCache = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	withAutumnId?: boolean;
	skipCache?: boolean;
}): Promise<{ apiEntity: ApiEntity }> => {
	const { org, env, db } = ctx;

	const cacheKey = buildCachedApiEntityKey({
		entityId,
		orgId: org.id,
		env,
	});

	// await redis.del(cacheKey);

	// Try to get from cache using Lua script (unless skipCache is true)
	if (!skipCache) {
		const cachedResult = await redis.eval(
			GET_ENTITY_SCRIPT,
			1, // number of keys
			cacheKey, // KEYS[1]
		);

		// If found in cache, parse and return
		if (cachedResult) {
			const cached = normalizeCachedData(
				JSON.parse(cachedResult as string) as ApiEntity,
			);

			return {
				apiEntity: ApiEntitySchema.parse({
					...cached,
					autumn_id: withAutumnId ? entityId : undefined,
				}),
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
		entityId,
	});

	const entity = fullCus.entity;
	if (!entity) {
		throw new Error(`Entity ${entityId} not found`);
	}

	// Store in cache (only if not skipping cache)
	if (!skipCache) {
		// Build ApiEntity (base only, no expand)
		const entityCusProducts = filterEntityLevelCusProducts({
			cusProducts: fullCus.customer_products,
		});
		const { apiEntity } = await getApiEntityBase({
			ctx,
			entity,
			fullCus: {
				...fullCus,
				customer_products: entityCusProducts,
			},
			withAutumnId: !skipCache,
		});

		await redis.eval(
			SET_ENTITY_SCRIPT,
			1, // number of keys
			cacheKey, // KEYS[1]
			JSON.stringify(apiEntity), // ARGV[1]
		);
	}

	// Build ApiEntity (base only, no expand)
	const { apiEntity } = await getApiEntityBase({
		ctx,
		entity,
		fullCus: fullCus,
		withAutumnId: !skipCache,
	});

	return {
		apiEntity: ApiEntitySchema.parse({
			...apiEntity,
			autumn_id: withAutumnId ? entity.internal_id : undefined,
		}),
	};
};
