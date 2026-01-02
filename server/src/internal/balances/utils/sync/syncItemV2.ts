import {
	type ApiBalance,
	type ApiBalanceBreakdown,
	type ApiCustomer,
	type ApiEntityV1,
	cusEntsToAllowance,
	cusEntToPrepaidQuantity,
	cusProductsToCusEnts,
	type FullCusEntWithFullCusProduct,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
	getRelevantFeatures,
	orgToInStatuses,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { sql } from "drizzle-orm";
import { getRegionalRedis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { getCachedApiEntity } from "../../../entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";

export interface SyncItemV2 {
	customerId: string;
	featureId: string;
	orgId: string;
	env: string;
	entityId?: string;
	region?: string;
	timestamp: number;
	breakdownIds: string[];
}

interface EntitlementSync {
	customer_entitlement_id: string;
	target_balance?: number;
	target_adjustment?: number;
	entity_feature_id?: string;
	target_entity_id?: string;
}

/**
 * Convert a breakdown item to backend balance using the corresponding cusEnt for prepaid quantity
 */
const breakdownToBackendBalance = ({
	breakdown,
	cusEnt,
}: {
	breakdown: ApiBalanceBreakdown;
	cusEnt: FullCusEntWithFullCusProduct;
}): number => {
	const prepaidQuantity = cusEntToPrepaidQuantity({ cusEnt });

	// Backend balance = prepaid_quantity + current_balance - purchased_balance
	return new Decimal(prepaidQuantity)
		.add(breakdown.current_balance)
		.sub(breakdown.purchased_balance)
		.toNumber();
};

const breakdownToTargetAdjustment = ({
	breakdown,
	cusEnt,
	targetEntityId,
}: {
	breakdown: ApiBalanceBreakdown;
	cusEnt: FullCusEntWithFullCusProduct;
	targetEntityId?: string;
}): number => {
	const allowance = cusEntsToAllowance({
		cusEnts: [cusEnt],
		entityId: targetEntityId,
	});

	const grantedBalance = breakdown.granted_balance ?? 0;

	console.log(
		`[breakdownToTargetAdjustment] grantedBalance: ${grantedBalance}, allowance: ${allowance}, targetEntityId: ${targetEntityId}`,
	);

	return new Decimal(grantedBalance).sub(allowance).toNumber();
};

/**
 * Build sync entries from Redis balance breakdown
 * Each breakdown item maps to one EntitlementSync entry
 */
const buildSyncEntries = ({
	redisBalance,
	cusEnts,
	item,
}: {
	redisBalance: ApiBalance;
	cusEnts: FullCusEntWithFullCusProduct[];
	item: SyncItemV2;
}): EntitlementSync[] => {
	const entries: EntitlementSync[] = [];

	if (!redisBalance.breakdown) return entries;

	// Normalize breakdownIds: Lua empty tables {} come through as objects, not arrays
	const breakdownIds = Array.isArray(item.breakdownIds)
		? item.breakdownIds
		: [];

	// Build a set of breakdown IDs to sync for efficient lookup
	// If empty, sync all breakdowns
	const breakdownIdsSet =
		breakdownIds.length > 0
			? new Set(breakdownIds)
			: new Set(redisBalance.breakdown.map((b) => b.id));

	// Iterate over SORTED cusEnts to maintain proper order
	// This ensures breakdown entries are in the same order as deduction order
	for (const cusEnt of cusEnts) {
		// Skip if this cusEnt is not in the breakdowns to sync
		if (!breakdownIdsSet.has(cusEnt.id)) continue;

		const breakdown = redisBalance.breakdown?.find((b) => b.id === cusEnt.id);
		if (!breakdown) continue;

		const targetBalance = breakdownToBackendBalance({ breakdown, cusEnt });
		const targetAdjustment = breakdownToTargetAdjustment({
			breakdown,
			cusEnt,
			targetEntityId: item.entityId,
		});

		entries.push({
			customer_entitlement_id: breakdown.id,
			target_balance: targetBalance,
			target_adjustment: targetAdjustment,
			entity_feature_id: cusEnt.entitlement.entity_feature_id ?? undefined,
			target_entity_id: item.entityId ?? undefined,
		});
	}

	return entries;
};

/**
 * Sync Redis balances to Postgres using the sync_balances SQL function
 * This is a cleaner approach than the old syncItem which repurposed deduction logic
 */
export const syncItemV2 = async ({
	item,
	ctx,
}: {
	item: SyncItemV2;
	ctx: AutumnContext;
}): Promise<void> => {
	const { customerId, featureId, entityId, region } = item;
	const { db, org, env } = ctx;

	// Get the correct regional Redis instance for this sync item
	const redisInstance = region ? getRegionalRedis(region) : undefined;

	// Get cached customer/entity from Redis WITHOUT merging
	let redisEntity: ApiCustomer | ApiEntityV1;

	ctx.skipCache = false;
	if (entityId) {
		const { apiEntity } = await getCachedApiEntity({
			ctx,
			customerId,
			entityId,
			skipCustomerMerge: true,
			redisInstance,
		});
		redisEntity = apiEntity;
	} else {
		const { apiCustomer } = await getCachedApiCustomer({
			ctx,
			customerId,
			skipEntityMerge: true,
			redisInstance,
		});
		redisEntity = apiCustomer;
	}

	// Get fresh customer from DB
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		inStatuses: RELEVANT_STATUSES,
		withEntities: false,
		withSubs: true,
		entityId,
	});

	// Filter to entity-level or customer-level cusProducts
	if (entityId) {
		fullCus.customer_products = filterEntityLevelCusProducts({
			cusProducts: fullCus.customer_products,
		});
	} else {
		fullCus.customer_products = filterOutEntitiesFromCusProducts({
			cusProducts: fullCus.customer_products,
		});
	}

	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId,
	});

	// Collect all sync entries across features
	const allEntries: EntitlementSync[] = [];

	for (const relevantFeature of relevantFeatures) {
		const redisBalance = redisEntity.balances?.[relevantFeature.id];
		if (!redisBalance) continue;

		const cusEnts = cusProductsToCusEnts({
			cusProducts: fullCus.customer_products,
			featureId: relevantFeature.id,
			reverseOrder: org.config?.reverse_deduction_order,
			entity: fullCus.entity,
			inStatuses: orgToInStatuses({ org }),
		});

		const entries = buildSyncEntries({
			redisBalance,
			cusEnts,
			item,
		});

		// console.log("Redis balance:", redisBalance);
		// console.log("Sync entries:", entries);
		allEntries.push(...entries);
	}

	if (allEntries.length === 0) {
		ctx.logger.info(
			`[SYNC V2] No entries to sync for customer ${customerId}, feature ${featureId}`,
		);
		return;
	}

	// Call the sync_balances SQL function
	const result = await db.execute(
		sql`SELECT * FROM sync_balances(
			${JSON.stringify({
				entitlements: allEntries,
				target_entity_id: entityId || null,
			})}::jsonb
		)`,
	);

	// Format result for readable logging
	const syncResult = result[0] as
		| {
				sync_balances?: {
					updates?: Record<string, { balance?: number; adjustment?: number }>;
				};
		  }
		| undefined;
	const updates = syncResult?.sync_balances?.updates;

	if (updates && Object.keys(updates).length > 0) {
		const formatted = Object.entries(updates)
			.map(([id, data]) => {
				const shortId = id.replace("cus_ent_", "");
				const parts: string[] = [];
				if (data.balance !== undefined) parts.push(`bal=${data.balance}`);
				if (data.adjustment !== undefined) parts.push(`adj=${data.adjustment}`);
				return `${shortId}: ${parts.join(", ")}`;
			})
			.join(" | ");

		ctx.logger.info(`[SYNC V2] (${customerId}) ${featureId}: ${formatted}`);
	} else {
		ctx.logger.info(`[SYNC V2] (${customerId}) ${featureId}: no changes`);
	}
};
