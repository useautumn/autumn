import {
	type ApiCustomer,
	ApiCustomerSchema,
	type AppEnv,
	type CustomerLegacyData,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { normalizeCachedData } from "../../../../utils/cacheUtils/cacheUtils.js";
import { SET_ENTITIES_BATCH_SCRIPT } from "../../../entities/entityUtils/apiEntityCacheUtils/luaScripts.js";
import { getApiEntityBase } from "../../../entities/entityUtils/apiEntityUtils/getApiEntityBase.js";
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
			org.id, // ARGV[1]
			env, // ARGV[2]
		);

		// If found in cache, parse and return
		if (cachedResult) {
			const cached = normalizeCachedData(
				JSON.parse(cachedResult as string) as ApiCustomer & {
					legacyData: CustomerLegacyData;
				},
			);

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
		withEntities: true,
		withSubs: true,
	});

	// Build ApiCustomer (base only, no expand)
	const { apiCustomer, legacyData } = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: !skipCache,
	});

	// Build master api customer (customer-level features only)
	const { apiCustomer: masterApiCustomer } = await getApiCustomerBase({
		ctx,
		fullCus: {
			...structuredClone(fullCus),
			customer_products: filterOutEntitiesFromCusProducts({
				cusProducts: fullCus.customer_products,
			}),
		},
		withAutumnId: !skipCache,
	});

	// Build entity api customers (entity-level features only)
	const entityLevelCusProducts = filterEntityLevelCusProducts({
		cusProducts: fullCus.customer_products,
	});

	// Store master customer cache (only if not skipping cache)
	if (!skipCache) {
		await redis.eval(
			SET_CUSTOMER_SCRIPT,
			1, // number of keys
			cacheKey, // KEYS[1]
			JSON.stringify({
				...masterApiCustomer,
				entities: fullCus.entities, // Include entities array for merging in Lua
				legacyData,
			}), // ARGV[1] - Store master, not merged
			org.id, // ARGV[2]
			env, // ARGV[3]
		);

		// Build all entities in batch
		const entityBatch = [];

		// Create a single shallow copy with entity-level products
		// getApiEntityBase will filter products per entity internally
		const entityFullCus = {
			...fullCus,
			customer_products: entityLevelCusProducts,
		};

		for (const entity of fullCus.entities) {
			const { apiEntity } = await getApiEntityBase({
				ctx,
				fullCus: entityFullCus,
				entity,
			});

			entityBatch.push({
				entityId: entity.id,
				entityData: apiEntity,
			});
		}

		// Store all entities in a single Redis call
		if (entityBatch.length > 0) {
			await redis.eval(
				SET_ENTITIES_BATCH_SCRIPT,
				0, // number of keys (we build them dynamically in Lua)
				JSON.stringify(entityBatch), // ARGV[1]
				org.id, // ARGV[2]
				env, // ARGV[3]
			);
		}
	}

	return {
		apiCustomer: ApiCustomerSchema.parse({
			...apiCustomer,

			autumn_id: withAutumnId ? fullCus.internal_id : undefined,
		}),
		legacyData,
	};
};
