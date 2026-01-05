import {
	type FullCustomer,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { getApiBalances } from "../apiCusUtils/getApiBalance/getApiBalances.js";

type BalancesPayload = Record<
	string,
	{
		granted_balance: number;
		breakdown?: Array<{ id: string; granted_balance: number }>;
	}
>;

type EntityBatchItem = {
	entityId: string;
	balances: BalancesPayload;
};

/**
 * Update granted_balance in Redis cache for all features
 * This is used after updateGrantedBalance to keep Redis in sync without clearing the entire cache
 *
 * Updates both:
 * 1. Customer-level cache (customer-level products only)
 * 2. Entity caches in batch (entity-level products only)
 */
export const setCachedGrantedBalance = async ({
	ctx,
	fullCus,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
}) => {
	const { org, env, logger } = ctx;
	const customerId = fullCus.id;

	if (!customerId) {
		logger.debug("[setCachedGrantedBalance] No customer ID, skipping");
		return;
	}

	// ============================================================================
	// 1. Build customer-level balances payload (customer-level products only)
	// ============================================================================
	const customerLevelCusProducts = filterOutEntitiesFromCusProducts({
		cusProducts: fullCus.customer_products,
	});

	const { data: customerBalances } = await getApiBalances({
		ctx,
		fullCus: {
			...fullCus,
			customer_products: customerLevelCusProducts,
		},
	});

	const customerBalancesPayload: BalancesPayload = {};
	for (const [featureId, balance] of Object.entries(customerBalances)) {
		customerBalancesPayload[featureId] = {
			granted_balance: balance.granted_balance,
			breakdown: balance.breakdown?.map((bd) => ({
				id: bd.id,
				granted_balance: bd.granted_balance,
			})),
		};
	}

	// ============================================================================
	// 2. Build entity balances batch (entity-level products only)
	// ============================================================================
	const entityLevelCusProducts = filterEntityLevelCusProducts({
		cusProducts: fullCus.customer_products,
	});

	const entityBatch: EntityBatchItem[] = [];

	for (const entity of fullCus.entities) {
		const { data: entityBalances } = await getApiBalances({
			ctx,
			fullCus: {
				...fullCus,
				customer_products: entityLevelCusProducts,
				entity,
			},
		});

		const entityBalancesPayload: BalancesPayload = {};
		for (const [featureId, balance] of Object.entries(entityBalances)) {
			entityBalancesPayload[featureId] = {
				granted_balance: balance.granted_balance,
				breakdown: balance.breakdown?.map((bd) => ({
					id: bd.id,
					granted_balance: bd.granted_balance,
				})),
			};
		}

		if (Object.keys(entityBalancesPayload).length > 0) {
			entityBatch.push({
				entityId: entity.id,
				balances: entityBalancesPayload,
			});
		}
	}

	// ============================================================================
	// 3. Write to Redis in a single call
	// ============================================================================
	await tryRedisWrite(async () => {
		return redis.setGrantedBalance(
			org.id,
			env,
			customerId,
			JSON.stringify(customerBalancesPayload),
			JSON.stringify(entityBatch),
		);
	});

	logger.debug(
		`[setCachedGrantedBalance] Updated granted_balance for customer (${Object.keys(customerBalancesPayload).length} features) and ${entityBatch.length} entities`,
	);
};
