import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
	SortCusEntParams,
} from "@autumn/shared";
import { DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT } from "@/_luaScriptsV2/luaScriptsV2.js";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { isPaidContinuousUse } from "@/internal/features/featureUtils.js";
import type { FeatureDeduction } from "../../track/trackUtils/getFeatureDeductions.js";
import { handlePaidAllocatedCusEnt } from "../../track/trackUtils/handlePaidAllocatedCusEnt.js";
import { rollbackDeduction } from "../../track/trackUtils/rollbackDeduction.js";
import { applyDeductionUpdateToFullCustomer } from "../deduction/applyDeductionUpdateToFullCustomer.js";
import { prepareFeatureDeduction } from "../deduction/prepareFeatureDeduction.js";
import type { DeductionUpdate } from "../types/deductionUpdate";
import {
	RedisDeductionError,
	type RedisDeductionErrorCode,
} from "../types/redisDeductionError.js";
import type { LuaDeductionResult } from "../types/redisDeductionResult.js";

export type RedisDeductionParams = {
	ctx: AutumnContext;
	entityId?: string;
	deductions: FeatureDeduction[];
	overageBehaviour?: "cap" | "reject" | "allow";
	addToAdjustment?: boolean;
	skipAdditionalBalance?: boolean;
	alterGrantedBalance?: boolean;
	fullCustomer: FullCustomer;
	sortParams?: SortCusEntParams;
};

export const deductFromRedisCusEnts = async ({
	ctx,
	entityId,
	deductions,
	fullCustomer,
	sortParams,
	overageBehaviour = "cap",
	addToAdjustment = false,
	skipAdditionalBalance = true,
}: RedisDeductionParams): Promise<{
	oldFullCus: FullCustomer;
	fullCus: FullCustomer | undefined;
	updates: Record<string, DeductionUpdate>;
}> => {
	const { org, env } = ctx;
	const oldFullCus = structuredClone(fullCustomer);

	const isPaidAllocated = deductions.some((d) =>
		isPaidContinuousUse({
			feature: d.feature,
			fullCus: fullCustomer!,
		}),
	);

	if (isPaidAllocated) {
		overageBehaviour = "reject";
		skipAdditionalBalance = true;
	}

	let allUpdates: Record<string, DeductionUpdate> = {};

	// Build cache key
	const customerId = fullCustomer.id || fullCustomer.internal_id;
	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});

	for (const deduction of deductions) {
		const { feature, deduction: toDeduct, targetBalance } = deduction;

		const { customerEntitlementDeductions, rolloverIds, customerEntitlements } =
			prepareFeatureDeduction({
				ctx,
				fullCustomer,
				deduction,
				options: {
					overageBehaviour,
					addToAdjustment,
					sortParams,
					skipAdditionalBalance,
				},
			});

		// Call Lua script to deduct from FullCustomer in Redis
		const luaParams = {
			sorted_entitlements: customerEntitlementDeductions,
			amount_to_deduct: toDeduct ?? null,
			target_balance: targetBalance ?? null,
			target_entity_id: entityId || null,
			rollover_ids: rolloverIds.length > 0 ? rolloverIds : null,
			skip_additional_balance: skipAdditionalBalance,
			overage_behaviour: overageBehaviour ?? "cap",
			feature_id: feature.id,
		};

		const result = (await redis.eval(
			DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT,
			1, // number of keys
			cacheKey, // KEYS[1]
			JSON.stringify(luaParams), // ARGV[1]
		)) as string;

		const resultJson = JSON.parse(result) as LuaDeductionResult;

		if (resultJson.error) {
			throw new RedisDeductionError({
				message: `Redis deduction failed: ${resultJson.error}`,
				code: resultJson.error as RedisDeductionErrorCode,
			});
		}

		const { updates } = resultJson;
		allUpdates = { ...allUpdates, ...updates };

		// Handle paid allocated entitlements and update fullCus in memory
		try {
			for (const cusEntId of Object.keys(updates)) {
				const update = updates[cusEntId];
				const cusEnt = customerEntitlements.find(
					(ce: FullCusEntWithFullCusProduct) => ce.id === cusEntId,
				);

				if (!cusEnt) continue;

				await handlePaidAllocatedCusEnt({
					ctx,
					cusEnt,
					fullCus: fullCustomer,
					updates,
				});

				applyDeductionUpdateToFullCustomer({
					fullCus: fullCustomer,
					cusEntId,
					update,
				});
			}
		} catch (error) {
			if (error instanceof Error && !error?.message?.includes("declined")) {
				ctx.logger.error(
					`[deductFromRedisCusEnts] Attempting rollback due to error: ${error}`,
				);
			}
			await rollbackDeduction({
				ctx,
				oldFullCus,
				updates,
			});
			throw error;
		}
	}

	return {
		oldFullCus,
		fullCus: fullCustomer,
		updates: allUpdates,
	};
};

// // Log Lua debug output
// if (resultJson.logs && resultJson.logs.length > 0) {
// 	console.log("\n========== LUA LOGS ==========");
// 	for (const log of resultJson.logs) {
// 		console.log(log);
// 	}
// 	console.log("==============================\n");
// }

// // Log what's in Redis BEFORE the Lua script runs
// const preRedisState = await redis.call(
// 	"JSON.GET",
// 	cacheKey,
// 	"$.customer_products[0].customer_entitlements[0].entities",
// );
// console.log(
// 	`[deductFromRedisCusEnts] PRE-LUA Redis state for ${entityId}:`,
// 	preRedisState,
// );
// console.log(
// 	`[deductFromRedisCusEnts] Lua params: amount_to_deduct=${luaParams.amount_to_deduct}, target_balance=${luaParams.target_balance}`,
// );

// Log what's in Redis AFTER the Lua script runs
// const postRedisState = await redis.call(
// 	"JSON.GET",
// 	cacheKey,
// 	"$.customer_products[0].customer_entitlements[0].entities",
// );
// console.log(
// 	`[deductFromRedisCusEnts] POST-LUA Redis state for ${entityId}:`,
// 	postRedisState,
// );

// // Calculate total deducted from the updates
// const totalDeducted = Object.values(updates).reduce(
// 	(sum, update) => sum + update.deducted,
// 	0,
// );

// // Convert updates to actual deductions and collect modified cusEntIds
// for (const [cusEntId, update] of Object.entries(updates)) {
// 	modifiedCusEntIds.push(cusEntId);

// 	const cusEnt = customerEntitlements.find((ce) => ce.id === cusEntId);
// 	const deductedFeature = cusEnt?.entitlement.feature;
// 	if (!deductedFeature) continue;

// 	const currentDeduction = actualDeductions[deductedFeature.id] || 0;
// 	actualDeductions[deductedFeature.id] = new Decimal(update.deducted)
// 		.add(currentDeduction)
// 		.toNumber();
// }

// // Log deduction details
// if (targetBalance !== undefined) {
// 	const entityInfo = entityId
// 		? `; Entity: ${entityId}`
// 		: "Entity: customer-level";
// 	ctx.logger.info(`[Redis Sync]; Feature ${feature.id} | ${entityInfo}`, {
// 		data: {
// 			featureId: feature.id,
// 			entityInfo,
// 			totalDeducted,
// 			updates: Object.keys(updates).length,
// 			remaining: featureRemaining,
// 		},
// 	});
// } else {
// 	ctx.logger.info(
// 		`[Redis Track]; Deducted ${totalDeducted} from feature ${feature.id}. Updated ${Object.keys(updates).length} entitlements. Remaining: ${featureRemaining}`,
// 	);
// }
