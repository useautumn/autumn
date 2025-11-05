import {
	type ApiCustomer,
	ApiCustomerSchema,
	type ApiEntity,
	type AppEnv,
	type CustomerLegacyData,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	normalizeCachedData,
	tryRedisRead,
	tryRedisWrite,
} from "../../../../utils/cacheUtils/cacheUtils.js";
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

	// skipCache = true;

	// Try to get from cache using Lua script (unless skipCache is true)
	if (!skipCache) {
		const start = performance.now();
		const cachedResult = await tryRedisRead(() =>
			redis.eval(GET_CUSTOMER_SCRIPT, 1, cacheKey, org.id, env),
		);
		const end = performance.now();
		logger.info(`get customer from cache took ${Math.round(end - start)}ms`);

		if (cachedResult) {
			const cached = normalizeCachedData(
				JSON.parse(cachedResult as string) as ApiCustomer & {
					legacyData: CustomerLegacyData;
				},
			);

			const { legacyData, ...rest } = cached;

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

	// Build ApiCustomer (base only, no expand)
	const { apiCustomer, legacyData } = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: true,
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
		withAutumnId: true,
	});

	// Build entity api customers (entity-level features only)
	const entityLevelCusProducts = filterEntityLevelCusProducts({
		cusProducts: fullCus.customer_products,
	});

	// Store master customer cache (only if not skipping cache)
	if (!skipCache) {
		// Build entities first
		const entityBatch: { entityId: string; entityData: ApiEntity }[] = [];
		const entityFullCus = {
			...fullCus,
			customer_products: entityLevelCusProducts,
		};

		for (const entity of fullCus.entities) {
			const { apiEntity } = await getApiEntityBase({
				ctx,
				fullCus: entityFullCus,
				entity,
				withAutumnId: true,
			});

			entityBatch.push({
				entityId: entity.id,
				entityData: apiEntity,
			});
		}

		// Then write to Redis
		await tryRedisWrite(async () => {
			await redis.eval(
				SET_CUSTOMER_SCRIPT,
				1,
				cacheKey,
				JSON.stringify({
					...masterApiCustomer,
					entities: fullCus.entities,
					legacyData,
				}),
				org.id,
				env,
			);

			if (entityBatch.length > 0) {
				await redis.eval(
					SET_ENTITIES_BATCH_SCRIPT,
					0,
					JSON.stringify(entityBatch),
					org.id,
					env,
				);
			}
		});
	}

	return {
		apiCustomer: ApiCustomerSchema.parse(apiCustomer),
		legacyData,
	};
};
