import {
	addToExpand,
	CusExpand,
	type FullCustomer,
	filterCusProductsByEntity,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { getApiSubscriptions } from "../apiCusUtils/getApiSubscription/getApiSubscriptions.js";

/**
 * Set customer subscriptions cache in Redis with all entities
 * This function updates subscriptions and scheduled_subscriptions arrays in the customer cache (customer-level only)
 * and individual entity caches (entity-level only)
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
		add: [CusExpand.SubscriptionsPlan, CusExpand.ScheduledSubscriptionsPlan],
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

	// Split subscriptions by status
	const activeSubscriptions = masterApiSubs.filter(
		(s) => s.status === "active",
	);
	const scheduledSubscriptions = masterApiSubs.filter(
		(s) => s.status === "scheduled",
	);

	// console.log(`Updating api subs for customer ${customerId}`, masterApiSubs);

	// Then write to Redis
	await tryRedisWrite(async () => {
		// Update customer subscriptions and scheduled_subscriptions
		await redis.setSubscriptions(
			JSON.stringify(activeSubscriptions),
			JSON.stringify(scheduledSubscriptions),
			org.id,
			env,
			customerId,
		);
		logger.info(
			`Updated customer subscriptions cache for customer ${customerId} (${activeSubscriptions.length} active, ${scheduledSubscriptions.length} scheduled)`,
		);

		// Update entity subscriptions
		for (const entity of fullCus.entities) {
			// Filter customer products for this specific entity
			const entityCusProducts = filterCusProductsByEntity({
				cusProducts: fullCus.customer_products,
				entity,
				org,
			});

			const { data: entitySubscriptions } = await getApiSubscriptions({
				ctx: ctxWithExpand,
				fullCus: {
					...fullCus,
					customer_products: entityCusProducts,
					entity, // Set entity for entity-specific balance calculations
				},
			});

			// Split entity subscriptions by status
			const entityActiveSubscriptions = entitySubscriptions.filter(
				(s) => s.status === "active",
			);
			const entityScheduledSubscriptions = entitySubscriptions.filter(
				(s) => s.status === "scheduled",
			);

			await redis.setEntityProducts(
				JSON.stringify(entityActiveSubscriptions),
				JSON.stringify(entityScheduledSubscriptions),
				org.id,
				env,
				customerId,
				entity.id,
			);
			logger.info(
				`Updated entity subscriptions cache for entity ${entity.id} (${entityActiveSubscriptions.length} active, ${entityScheduledSubscriptions.length} scheduled)`,
			);
		}
	});
};
