import {
	type ApiEntity,
	type FullCustomer,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { SET_ENTITIES_BATCH_SCRIPT } from "../../../entities/entityUtils/apiEntityCacheUtils/entityLuaScripts/luaScripts.js";
import { getApiEntityBase } from "../../../entities/entityUtils/apiEntityUtils/getApiEntityBase.js";
import { getApiCustomerBase } from "../apiCusUtils/getApiCustomerBase.js";
import { SET_CUSTOMER_SCRIPT } from "./cusLuaScripts/luaScripts.js";
import { buildCachedApiCustomerKey } from "./getCachedApiCustomer.js";

/**
 * Set customer cache in Redis with all entities
 * This function builds the master customer cache (customer-level features only)
 * and individual entity caches (entity-level features only)
 */
export const setCachedApiCustomer = async ({
	ctx,
	fullCus,
	customerId,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	customerId: string;
}) => {
	const { org, env } = ctx;

	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId: org.id,
		env,
	});

	// Build master api customer (customer-level features only)
	const { apiCustomer: masterApiCustomer, legacyData } =
		await getApiCustomerBase({
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
};
