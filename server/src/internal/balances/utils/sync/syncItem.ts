import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	type ApiBalance,
	type ApiBalanceBreakdown,
	type ApiCustomer,
	type ApiEntityV1,
	cusEntsToPrepaidQuantity,
	cusProductsToCusEnts,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
	getRelevantFeatures,
	orgToInStatuses,
	type SortCusEntParams,
	sumValues,
} from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { getRegionalRedis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deductFromCusEntsPostgres } from "@/internal/balances/track/trackUtils/runDeductionTx.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { CACHE_CUSTOMER_VERSIONS } from "../../../../_luaScripts/cacheConfig.js";
import { handleThresholdReached } from "../../../../trigger/handleThresholdReached.js";
import { getCachedApiEntity } from "../../../entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";
import type { FeatureDeduction } from "../../track/trackUtils/getFeatureDeductions.js";

export interface SyncItem {
	customerId: string;
	featureId: string;
	orgId: string;
	env: string;
	entityId?: string;
	region?: string;
	timestamp: number;
	sortParams?: SortCusEntParams;
	alterGrantedBalance?: boolean;
	overageBehaviour?: "cap" | "reject" | "allow";
	cacheVersion?: string;
	fullCustomer?: FullCustomer; // old full customer
}

/**
 * Convert ApiBalance or ApiBalanceBreakdown to backend balance
 * Works with both full balance objects and breakdown items (same fields used)
 */
const apiToBackendBalance = ({
	cusEnts,
	apiBalance,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	apiBalance?: ApiBalance | ApiBalanceBreakdown;
}) => {
	if (!apiBalance) return 0;

	const totalPrepaidQuantity = sumValues(
		cusEnts.map((cusEnt) => cusEntsToPrepaidQuantity({ cusEnts })),
	);

	// Backend balance = prepaid_quantity + current_balance - purchased_balance
	const backendBalance = new Decimal(totalPrepaidQuantity)
		.add(apiBalance.current_balance)
		.sub(apiBalance.purchased_balance)
		.toNumber();

	return backendBalance;
};

/**
 * Filter balance by sortParams.cusEntIds
 * Returns a modified ApiBalance with:
 * - breakdown filtered to only matching cusEntIds
 * - current_balance/purchased_balance summed from filtered breakdowns
 * If no filter, returns the original balance unchanged
 */
const applyCustomerEntitlementFiltersToBalance = ({
	apiBalance,
	sortParams,
}: {
	apiBalance: ApiBalance;
	sortParams?: SortCusEntParams;
}): ApiBalance | null => {
	// No filtering - return original balance
	if (!sortParams?.cusEntIds || sortParams.cusEntIds.length === 0) {
		return apiBalance;
	}

	// Filtering but no breakdowns - nothing to match
	if (!apiBalance.breakdown) {
		return apiBalance;
	}

	// Filter breakdowns to matching cusEntIds
	const filteredBreakdowns = apiBalance.breakdown.filter((b) =>
		sortParams.cusEntIds?.includes(b.id),
	);

	if (filteredBreakdowns.length === 0) {
		return null;
	}

	// Sum balances from filtered breakdowns using Decimal.js for precision
	const summedBalance = filteredBreakdowns.reduce(
		(acc, b) => ({
			current_balance: acc.current_balance.add(b.current_balance),
			purchased_balance: acc.purchased_balance.add(b.purchased_balance),
			granted_balance: acc.granted_balance.add(b.granted_balance),
			usage: acc.usage.add(b.usage),
		}),
		{
			current_balance: new Decimal(0),
			purchased_balance: new Decimal(0),
			granted_balance: new Decimal(0),
			usage: new Decimal(0),
		},
	);

	// Return modified balance with filtered breakdowns and summed values
	return {
		...apiBalance,
		current_balance: summedBalance.current_balance.toNumber(),
		purchased_balance: summedBalance.purchased_balance.toNumber(),
		granted_balance: summedBalance.granted_balance.toNumber(),
		usage: summedBalance.usage.toNumber(),
		breakdown: filteredBreakdowns,
	};
};

/**
 * Handle syncing a single item from Redis to PostgreSQL
 * Note: Does NOT use transaction or row locking - relies on deduction logic to handle concurrency
 */
export const syncItem = async ({
	item,
	ctx,
}: {
	item: SyncItem;
	ctx: AutumnContext;
}) => {
	const { customerId, featureId, entityId, region, sortParams } = item;
	const { db, org, env } = ctx;

	// Get the correct regional Redis instance for this sync item
	// This ensures we read from the same region where the data was written
	const redisInstance = region ? getRegionalRedis(region) : undefined;

	// Get cached customer/entity from Redis WITHOUT merging
	// For sync, we need the raw balance for that specific scope (not merged)
	let redisEntity: ApiCustomer | ApiEntityV1;

	ctx.skipCache = false;
	if (entityId) {
		const { apiEntity } = await getCachedApiEntity({
			ctx,
			customerId,
			entityId,
			skipCustomerMerge: true, // Don't merge with customer - we want entity's own balance
			redisInstance,
			cacheVersion: item.cacheVersion || CACHE_CUSTOMER_VERSIONS.PREVIOUS,
		});
		redisEntity = apiEntity;
	} else {
		const { apiCustomer } = await getCachedApiCustomer({
			ctx,
			customerId,
			skipEntityMerge: true, // Don't merge with entities - we want customer's own balance
			redisInstance,
			cacheVersion: item.cacheVersion || CACHE_CUSTOMER_VERSIONS.PREVIOUS,
		});
		redisEntity = apiCustomer;
	}

	// Get fresh customer from DB (no locking - let deduction handle it)
	const fullCus =
		item.fullCustomer ||
		(await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
			inStatuses: RELEVANT_STATUSES,
			withEntities: false,
			withSubs: true,
			entityId,
		}));

	// If entityId provided, deduct entity level cusEnts
	if (entityId) {
		fullCus.customer_products = filterEntityLevelCusProducts({
			cusProducts: fullCus.customer_products,
		});
	} else {
		// If entityId NOT provided, JUST deduct customer level cusEnts
		fullCus.customer_products = filterOutEntitiesFromCusProducts({
			cusProducts: fullCus.customer_products,
		});
	}

	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId,
	});

	const featureDeductions: FeatureDeduction[] = [];

	// ApiBalance -> BackendBalance

	for (const relevantFeature of relevantFeatures) {
		const redisBalance = redisEntity.balances?.[relevantFeature.id];
		if (!redisBalance) continue;

		const cusEnts = cusProductsToCusEnts({
			cusProducts: fullCus.customer_products,
			featureId: relevantFeature.id,
			reverseOrder: org.config?.reverse_deduction_order,
			entity: fullCus.entity,
			inStatuses: orgToInStatuses({ org }),
			sortParams,
		});

		// Filter balance by sortParams (handles breakdown filtering)
		const filteredBalance = applyCustomerEntitlementFiltersToBalance({
			apiBalance: redisBalance,
			sortParams,
		});

		if (!filteredBalance) continue;

		const backendBalance = apiToBackendBalance({
			cusEnts,
			apiBalance: filteredBalance,
		});

		featureDeductions.push({
			feature: relevantFeature,
			deduction: 0,
			targetBalance: backendBalance,
		});
	}

	// Sync from Redis to Postgres - deduct using target balance

	const result = await deductFromCusEntsPostgres({
		ctx,
		customerId,
		entityId,
		deductions: featureDeductions,
		fullCus, // to prevent fetching full customer again
		sortParams, // Filter to specific entitlement if provided
		refreshCache: false, // CRITICAL: Don't refresh cache after sync (Redis is the source of truth)
		alterGrantedBalance: item.alterGrantedBalance,
		overageBehaviour: item.overageBehaviour,
	});

	ctx.logger.info(
		`[SYNC COMPLETE] (${customerId}${entityId ? `, ${entityId}` : ""}) feature ${featureId}, target: ${chalk.yellow(featureDeductions?.[0]?.targetBalance)}`,
	);
	ctx.logger.info(
		`[SYNC COMPLETE], actual deducted: ${chalk.yellow(result.actualDeductions[featureId])}`,
	);

	if (process.env.NODE_ENV === "production") {
		console.log(`synced customer ${customerId}, feature ${featureId}`);
		console.log(`org: ${org.slug}, env: ${env}`);
	}

	// Old full cus vs new full cus
	if (result.fullCus) {
		for (const relevantFeature of relevantFeatures) {
			await handleThresholdReached({
				ctx,
				oldFullCus: result.oldFullCus,
				newFullCus: result.fullCus,
				feature: relevantFeature,
			});
		}
	}
};
