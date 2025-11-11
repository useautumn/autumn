import {
	type ApiBalance,
	type ApiCustomer,
	type ApiEntity,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
	getRelevantFeatures,
} from "@autumn/shared";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { getCachedApiEntity } from "../../../entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";
import type { FeatureDeduction } from "../trackUtils/getFeatureDeductions.js";
import { deductFromCusEnts } from "../trackUtils/runDeductionTx.js";

export interface SyncItem {
	customerId: string;
	featureId: string;
	orgId: string;
	env: string;
	entityId?: string;
	timestamp: number;
}

const apiToBackendBalance = ({ apiBalance }: { apiBalance?: ApiBalance }) => {
	if (!apiBalance) {
		return undefined;
	}
	// 1. Current balance = granted balance + purchased balance - usage
	return apiBalance.current_balance - apiBalance.purchased_balance;
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
	const { customerId, featureId, entityId } = item;
	const { db, org, env } = ctx;

	// Get cached customer/entity from Redis WITHOUT merging
	// For sync, we need the raw balance for that specific scope (not merged)
	let redisEntity: ApiCustomer | ApiEntity;
	if (entityId) {
		const { apiEntity } = await getCachedApiEntity({
			ctx,
			customerId,
			entityId,
			skipCustomerMerge: true, // Don't merge with customer - we want entity's own balance
		});
		redisEntity = apiEntity;
	} else {
		const { apiCustomer } = await getCachedApiCustomer({
			ctx,
			customerId,
			skipEntityMerge: true, // Don't merge with entities - we want customer's own balance
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

		const backendBalance = apiToBackendBalance({ apiBalance: redisBalance });

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

	// const logText = `sync complete | customer: ${customerId}, feature:${featureId}${entityId ? `, entity:${entityId}` : ""} [${org.slug}, ${env}]`;
	// console.log(logText);
	// ctx.logger.info(logText);
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
};
