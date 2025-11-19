import {
	addToExpand,
	CusExpand,
	type FullCustomer,
	filterCusProductsByEntity,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import {
	SET_ENTITY_PRODUCTS_SCRIPT,
	SET_SUBSCRIPTIONS_SCRIPT,
} from "@lua/luaScripts.js";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { getApiSubscriptions } from "../apiCusUtils/getApiSubscription/getApiSubscriptions.js";

/**
 * Set customer subscriptions cache in Redis with all entities
 * This function updates only the subscriptions array in the customer cache (customer-level subscriptions only)
 * and individual entity caches (entity-level subscriptions only)
 */
export const setCachedApiSubs = async ({
	ctx,
	fullCus,
	customerId,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	customerId: string;
}) => {
	const { org, env, logger } = ctx;

	// Build master api customer subscriptions (customer-level products only)
	const ctxWithExpand = addToExpand({
		ctx,
		add: [CusExpand.SubscriptionsPlan],
	});
	const { data: masterApiSubs } = await getApiSubscriptions({
		ctx: ctxWithExpand,
		fullCus: {
			...structuredClone(fullCus),
			customer_products: filterOutEntitiesFromCusProducts({
				cusProducts: fullCus.customer_products,
			}),
		},
	});

	// console.log(`Updating api subs for customer ${customerId}`, masterApiSubs);

	// Then write to Redis
	await tryRedisWrite(async () => {
		// Update customer subscriptions
		await redis.eval(
			SET_SUBSCRIPTIONS_SCRIPT,
			0, // No KEYS, all params in ARGV
			JSON.stringify(masterApiSubs),
			org.id,
			env,
			customerId,
		);
		logger.info(
			`Updated customer subscriptions cache for customer ${customerId} (${masterApiSubs.length} subscriptions)`,
		);

		// Update entity subscriptions
		for (const entity of fullCus.entities) {
			// Filter customer products for this specific entity
			const entityCusProducts = filterCusProductsByEntity({
				cusProducts: fullCus.customer_products,
				entity,
				org,
			});

			const { data: entityProducts } = await getApiSubscriptions({
				ctx: ctxWithExpand,
				fullCus: {
					...fullCus,
					customer_products: entityCusProducts,
					entity, // Set entity for entity-specific balance calculations
				},
			});

			await redis.eval(
				SET_ENTITY_PRODUCTS_SCRIPT,
				0, // No KEYS, all params in ARGV
				JSON.stringify(entityProducts),
				org.id,
				env,
				customerId,
				entity.id,
			);
			logger.info(
				`Updated entity subscriptions cache for entity ${entity.id} (${entityProducts.length} subscriptions)`,
			);
		}
	});
};
