import {
	type FullCustomer,
	filterCusProductsByEntity,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import {
	SET_CUSTOMER_PRODUCTS_SCRIPT,
	SET_ENTITY_PRODUCTS_SCRIPT,
} from "@lua/luaScripts.js";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { buildCachedApiEntityKey } from "../../../entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";
import { getApiCusProducts } from "../apiCusUtils/getApiCusProduct/getApiCusProducts.js";
import { buildCachedApiCustomerKey } from "./getCachedApiCustomer.js";

/**
 * Set customer products cache in Redis with all entities
 * This function updates only the products array in the customer cache (customer-level products only)
 * and individual entity caches (entity-level products only)
 */
export const setCachedApiCusProducts = async ({
	ctx,
	fullCus,
	customerId,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	customerId: string;
}) => {
	const { org, env, logger } = ctx;

	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId: org.id,
		env,
	});

	// Build master api customer products (customer-level products only)
	const { apiCusProducts: masterApiCusProducts } = await getApiCusProducts({
		ctx,
		fullCus: {
			...structuredClone(fullCus),
			customer_products: filterOutEntitiesFromCusProducts({
				cusProducts: fullCus.customer_products,
			}),
		},
	});

	// Then write to Redis
	await tryRedisWrite(async () => {
		// Update customer products
		await redis.eval(
			SET_CUSTOMER_PRODUCTS_SCRIPT,
			1,
			cacheKey,
			JSON.stringify(masterApiCusProducts),
		);
		logger.info(
			`Updated customer products cache for customer ${customerId} (${masterApiCusProducts.length} products)`,
		);

		// Update entity products
		for (const entity of fullCus.entities) {
			// Filter customer products for this specific entity
			const entityCusProducts = filterCusProductsByEntity({
				cusProducts: fullCus.customer_products,
				entity,
				org,
			});

			const { apiCusProducts: entityProducts } = await getApiCusProducts({
				ctx,
				fullCus: {
					...fullCus,
					customer_products: entityCusProducts,
					entity, // Set entity for entity-specific balance calculations
				},
			});

			const entityCacheKey = buildCachedApiEntityKey({
				entityId: entity.id,
				customerId,
				orgId: org.id,
				env,
			});

			await redis.eval(
				SET_ENTITY_PRODUCTS_SCRIPT,
				1,
				entityCacheKey,
				JSON.stringify(entityProducts),
			);
			logger.info(
				`Updated entity products cache for entity ${entity.id} (${entityProducts.length} products)`,
			);
		}
	});
};
