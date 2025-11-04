import {
	type ApiCustomer,
	type ApiEntity,
	getRelevantFeatures,
} from "@autumn/shared";
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

	// Get cached customer from Redis
	let redisEntity: ApiCustomer | ApiEntity;
	if (entityId) {
		const { apiEntity } = await getCachedApiEntity({
			ctx,
			customerId,
			entityId,
		});
		redisEntity = apiEntity;
	} else {
		const { apiCustomer } = await getCachedApiCustomer({
			ctx,
			customerId,
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

	// const { apiCustomer: pgCustomer } = await getApiCustomerBase({
	// 	ctx,
	// 	fullCus,
	// 	withAutumnId: false,
	// });

	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId,
	});

	const featureDeductions: FeatureDeduction[] = [];

	// console.log(
	// 	"SYNC LAYER, REDIS CUSTOMER FEATURES:",
	// 	JSON.stringify(redisCustomer.features, null, 2),
	// );

	for (const relevantFeature of relevantFeatures) {
		const redisCusFeature = redisEntity.features?.[relevantFeature.id];
		featureDeductions.push({
			feature: relevantFeature,
			deduction: 0,
			targetBalance: redisCusFeature?.balance ?? 0,
		});
	}

	// Sync from Redis to Postgres - deduct using target balance

	await deductFromCusEnts({
		ctx,
		customerId,
		entityId,
		deductions: featureDeductions,
		fullCus, // to prevent fetching full customer again
		refreshCache: false, // CRITICAL: Don't refresh cache after sync (Redis is the source of truth)
	});
};
