import { type ApiEntity, ApiEntitySchema, type AppEnv } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	normalizeCachedData,
	tryRedisRead,
} from "@/utils/cacheUtils/cacheUtils.js";
import { setCachedApiCustomer } from "../../../customers/cusUtils/apiCusCacheUtils/setCachedApiCustomer.js";
import { getApiEntityBase } from "../apiEntityUtils/getApiEntityBase.js";
import { GET_ENTITY_SCRIPT } from "./entityLuaScripts/luaScripts.js";

export const buildCachedApiEntityKey = ({
	entityId,
	customerId,
	orgId,
	env,
}: {
	entityId: string;
	customerId: string;
	orgId: string;
	env: string;
}) => {
	return `{${orgId}}:${env}:customer:${customerId}:entity:${entityId}`;
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
		customerId,
		orgId: org.id,
		env,
	});

	// Try to get from cache using Lua script (unless skipCache is true)
	if (!skipCache) {
		const cachedResult = await tryRedisRead(() =>
			redis.eval(
				GET_ENTITY_SCRIPT,
				1, // number of keys
				cacheKey, // KEYS[1]
				org.id, // ARGV[1]
				env, // ARGV[2]
			),
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
		// Set entity cache
		await setCachedApiCustomer({
			ctx,
			fullCus,
			customerId,
		});
		// const { apiCustomer: masterApiCustomer, legacyData } =
		// 	await getApiCustomerBase({
		// 		ctx,
		// 		fullCus: {
		// 			...structuredClone(fullCus),
		// 			customer_products: filterOutEntitiesFromCusProducts({
		// 				cusProducts: fullCus.customer_products,
		// 			}),
		// 		},
		// 		withAutumnId: !skipCache,
		// 	});

		// // Build ApiEntity with filtered entity-level products for caching
		// const entityCusProducts = filterEntityLevelCusProducts({
		// 	cusProducts: fullCus.customer_products,
		// });
		// const { apiEntity: apiEntityForCache, legacyData: entityLegacyData } =
		// 	await getApiEntityBase({
		// 		ctx,
		// 		entity,
		// 		fullCus: {
		// 			...fullCus,
		// 			customer_products: entityCusProducts,
		// 		},
		// 		withAutumnId: true,
		// 	});

		// await tryRedisWrite(async () => {
		// 	// Get customer
		// 	const customerCacheKey = buildCachedApiCustomerKey({
		// 		customerId,
		// 		orgId: org.id,
		// 		env,
		// 	});
		// 	const cachedCustomer = await redis.eval(
		// 		GET_CUSTOMER_SCRIPT,
		// 		1,
		// 		customerCacheKey,
		// 		org.id,
		// 		env,
		// 		customerId,
		// 	);

		// 	if (!cachedCustomer) {
		// 		await redis.eval(
		// 			SET_CUSTOMER_SCRIPT,
		// 			1,
		// 			customerCacheKey,
		// 			JSON.stringify({
		// 				...masterApiCustomer,
		// 				entities: fullCus.entities,
		// 				legacyData,
		// 			}),
		// 			org.id,
		// 			env,
		// 		);
		// 	}

		// 	await redis.eval(
		// 		SET_ENTITY_SCRIPT,
		// 		1, // number of keys
		// 		cacheKey, // KEYS[1]
		// 		JSON.stringify({
		// 			...apiEntityForCache,
		// 			legacyData: entityLegacyData,
		// 		}), // ARGV[1]
		// 	);
		// });
	}

	// Build ApiEntity with full products for return
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
