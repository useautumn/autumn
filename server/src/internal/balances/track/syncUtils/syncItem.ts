import type { Feature, FullCusEntWithFullCusProduct } from "@autumn/shared";
import {
	type ApiBalance,
	type ApiCustomer,
	type ApiEntityV1,
	cusEntToPrepaidQuantity,
	cusProductsToCusEnts,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
	getRelevantFeatures,
	orgToInStatuses,
	sumValues,
} from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { getRegionalRedis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { handleThresholdReached } from "../../../../trigger/handleThresholdReached.js";
import { getCachedApiEntity } from "../../../entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";
import type { FeatureDeduction } from "../trackUtils/getFeatureDeductions.js";
import { deductFromCusEnts } from "../trackUtils/runDeductionTx.js";

export interface SyncItem {
	customerId: string;
	featureId: string;
	orgId: string;
	env: string;
	entityId?: string;
	region?: string;
	timestamp: number;
}

const apiToBackendBalance = ({
	cusEnts,
	features,
	apiBalance,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	features: Feature[];
	apiBalance?: ApiBalance;
}) => {
	const feature = features.find((f) => f.id === apiBalance?.feature_id);
	if (!apiBalance || !feature) return 0;

	const totalPrepaidQuantity = sumValues(
		cusEnts.map((cusEnt) => cusEntToPrepaidQuantity({ cusEnt })),
	);

	const backendBalance = new Decimal(totalPrepaidQuantity)
		.add(apiBalance.current_balance)
		.sub(apiBalance.purchased_balance)
		.toNumber();

	// console.log("Converting api balance to backend balance");
	// console.log(`Current balance: ${apiBalance.current_balance}`);
	// console.log(`Purchased balance: ${apiBalance.purchased_balance}`);
	// console.log(`Total prepaid quantity: ${totalPrepaidQuantity}`);
	// console.log(`Backend balance: ${backendBalance}`);

	// 1. Current balance = granted balance + purchased balance - usage
	return backendBalance;
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
	const { customerId, featureId, entityId, region } = item;
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
		});
		redisEntity = apiEntity;
	} else {
		const { apiCustomer } = await getCachedApiCustomer({
			ctx,
			customerId,
			skipEntityMerge: true, // Don't merge with entities - we want customer's own balance
			redisInstance,
		});
		redisEntity = apiCustomer;
	}

	// Get fresh customer from DB (no locking - let deduction handle it)
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
		});

		const backendBalance = apiToBackendBalance({
			apiBalance: redisBalance,
			cusEnts,
			features: [relevantFeature],
		});

		featureDeductions.push({
			feature: relevantFeature,
			deduction: 0,
			targetBalance: backendBalance,
		});
	}

	// Sync from Redis to Postgres - deduct using target balance

	const result = await deductFromCusEnts({
		ctx,
		customerId,
		entityId,
		deductions: featureDeductions,
		fullCus, // to prevent fetching full customer again
		refreshCache: false, // CRITICAL: Don't refresh cache after sync (Redis is the source of truth)
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
