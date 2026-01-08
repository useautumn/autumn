import type { PgDeductionUpdate, SortCusEntParams } from "@autumn/shared";
import {
	cusEntToCusPrice,
	cusEntToStartingBalance,
	cusProductsToCusEnts,
	ErrCode,
	FeatureUsageType,
	type FullCustomer,
	getMaxOverage,
	getRelevantFeatures,
	InternalError,
	notNullish,
	nullish,
	orgToInStatuses,
	RecaseError,
	updateCusEntInFullCus,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { getUnlimitedAndUsageAllowed } from "../../../customers/cusProducts/cusEnts/cusEntUtils.js";
import { buildFullCustomerCacheKey } from "../../../customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { getCreditCost } from "../../../features/creditSystemUtils.js";
import { isPaidContinuousUse } from "../../../features/featureUtils.js";
import type { FeatureDeduction } from "../../track/trackUtils/getFeatureDeductions.js";
import { handlePaidAllocatedCusEnt } from "../../track/trackUtils/handlePaidAllocatedCusEnt.js";
import { rollbackDeduction } from "../../track/trackUtils/rollbackDeduction.js";
import { DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT } from "./luaScriptsV2.js";

export type RedisDeductionParams = {
	ctx: AutumnContext;
	entityId?: string;
	deductions: FeatureDeduction[];
	overageBehaviour?: "cap" | "reject" | "allow";
	addToAdjustment?: boolean;
	skipAdditionalBalance?: boolean;
	alterGrantedBalance?: boolean;
	fullCus: FullCustomer;
	sortParams?: SortCusEntParams;
};

interface LuaDeductionResult {
	updates: Record<string, PgDeductionUpdate>;
	remaining: number;
	error?: string;
	feature_id?: string;
	logs?: string[];
}

export const deductFromRedisCusEnts = async ({
	ctx,
	entityId,
	deductions,
	overageBehaviour = "cap",
	addToAdjustment = false,
	skipAdditionalBalance = true,
	fullCus,
	sortParams,
}: RedisDeductionParams): Promise<{
	oldFullCus: FullCustomer;
	fullCus: FullCustomer | undefined;
	isPaidAllocated: boolean;
	actualDeductions: Record<string, number>;
	remainingAmounts: Record<string, number>;
	modifiedCusEntIds: string[];
}> => {
	const { org, env } = ctx;
	const oldFullCus = structuredClone(fullCus);

	const isPaidAllocated = deductions.some((d) =>
		isPaidContinuousUse({
			feature: d.feature,
			fullCus: fullCus!,
		}),
	);

	if (isPaidAllocated) {
		overageBehaviour = "reject";
		skipAdditionalBalance = true;
	}

	const actualDeductions: Record<string, number> = {};
	const remainingAmounts: Record<string, number> = {};
	const modifiedCusEntIds: string[] = [];

	// Build cache key
	const customerId = fullCus.id || fullCus.internal_id;
	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});

	for (const deduction of deductions) {
		const { feature, deduction: toDeduct, targetBalance } = deduction;

		const relevantFeatures = notNullish(targetBalance)
			? [feature]
			: getRelevantFeatures({
					features: ctx.features,
					featureId: feature.id,
				});

		const cusEnts = cusProductsToCusEnts({
			cusProducts: fullCus.customer_products,
			featureIds: relevantFeatures.map((f) => f.id),
			reverseOrder: org.config?.reverse_deduction_order,
			entity: fullCus.entity,
			inStatuses: orgToInStatuses({ org }),
			sortParams,
		});

		// Check if ANY relevant feature is unlimited
		let unlimited = false;
		for (const rf of relevantFeatures) {
			const { unlimited: featureUnlimited } = getUnlimitedAndUsageAllowed({
				cusEnts,
				internalFeatureId: rf.internal_id!,
			});
			if (featureUnlimited) {
				unlimited = true;
				if (actualDeductions[rf.id] === undefined) {
					actualDeductions[rf.id] = 0;
				}
			}
		}

		if (cusEnts.length === 0 || unlimited) continue;

		const cusEntInput = cusEnts.map((ce) => {
			const creditCost = getCreditCost({
				featureId: feature.id,
				creditSystem: ce.entitlement.feature,
			});

			const maxOverage = getMaxOverage({ cusEnt: ce });

			const cusPrice = cusEntToCusPrice({ cusEnt: ce });
			const isFreeAllocated =
				ce.entitlement.feature.config?.usage_type ===
					FeatureUsageType.Continuous && nullish(cusPrice);

			const resetBalance = cusEntToStartingBalance({ cusEnt: ce });

			return {
				customer_entitlement_id: ce.id,
				credit_cost: creditCost,
				entity_feature_id: ce.entitlement.entity_feature_id,
				usage_allowed:
					ce.usage_allowed ||
					(isFreeAllocated && overageBehaviour !== "reject"),
				min_balance: notNullish(maxOverage) ? -maxOverage : undefined,
				add_to_adjustment: addToAdjustment,
				max_balance: resetBalance,
			};
		});

		// Collect and sort rollovers by expires_at (oldest first)
		const sortedRollovers = cusEnts
			.flatMap((ce) => ce.rollovers || [])
			.sort((a, b) => {
				if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
				if (a.expires_at && !b.expires_at) return -1;
				if (!a.expires_at && b.expires_at) return 1;
				return 0;
			});

		const rolloverIds = sortedRollovers.map((r) => r.id);
		const cusEntIds = cusEntInput.map((ce) => ce.customer_entitlement_id);

		// Call Lua script to deduct from FullCustomer in Redis
		const luaParams = {
			sorted_entitlements: cusEntInput,
			amount_to_deduct: toDeduct ?? null,
			target_balance: targetBalance ?? null,
			target_entity_id: entityId || null,
			rollover_ids: rolloverIds.length > 0 ? rolloverIds : null,
			cus_ent_ids: cusEntIds.length > 0 ? cusEntIds : null,
			skip_additional_balance: skipAdditionalBalance,
			overage_behaviour: overageBehaviour ?? "cap",
			feature_id: feature.id,
		};

		// Log what's in Redis BEFORE the Lua script runs
		const preRedisState = await redis.call(
			"JSON.GET",
			cacheKey,
			"$.customer_products[0].customer_entitlements[0].entities",
		);
		console.log(
			`[deductFromRedisCusEnts] PRE-LUA Redis state for ${entityId}:`,
			preRedisState,
		);
		console.log(
			`[deductFromRedisCusEnts] Lua params: amount_to_deduct=${luaParams.amount_to_deduct}, target_balance=${luaParams.target_balance}`,
		);

		const result = (await redis.eval(
			DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT,
			1, // number of keys
			cacheKey, // KEYS[1]
			JSON.stringify(luaParams), // ARGV[1]
		)) as string;

		// Log what's in Redis AFTER the Lua script runs
		const postRedisState = await redis.call(
			"JSON.GET",
			cacheKey,
			"$.customer_products[0].customer_entitlements[0].entities",
		);
		console.log(
			`[deductFromRedisCusEnts] POST-LUA Redis state for ${entityId}:`,
			postRedisState,
		);

		const resultJson = JSON.parse(result) as LuaDeductionResult;

		// Log Lua debug output
		if (resultJson.logs && resultJson.logs.length > 0) {
			console.log("\n========== LUA LOGS ==========");
			for (const log of resultJson.logs) {
				console.log(log);
			}
			console.log("==============================\n");
		}

		// Handle errors from Lua script
		if (resultJson.error === "CUSTOMER_NOT_FOUND") {
			throw new InternalError({
				message: `FullCustomer not found in cache: ${customerId}`,
				code: "customer_not_in_cache",
			});
		}

		if (resultJson.error === "INSUFFICIENT_BALANCE") {
			throw new RecaseError({
				message: `Insufficient balance for feature ${resultJson.feature_id}`,
				code: ErrCode.InsufficientBalance,
				statusCode: 402,
			});
		}

		const { updates, remaining: featureRemaining } = resultJson;

		// Track remaining amount
		remainingAmounts[feature.id] = featureRemaining;

		// Calculate total deducted from the updates
		const totalDeducted = Object.values(updates).reduce(
			(sum, update) => sum + update.deducted,
			0,
		);

		// Convert updates to actual deductions and collect modified cusEntIds
		for (const [cusEntId, update] of Object.entries(updates)) {
			modifiedCusEntIds.push(cusEntId);

			const cusEnt = cusEnts.find((ce) => ce.id === cusEntId);
			const deductedFeature = cusEnt?.entitlement.feature;
			if (!deductedFeature) continue;

			const currentDeduction = actualDeductions[deductedFeature.id] || 0;
			actualDeductions[deductedFeature.id] = new Decimal(update.deducted)
				.add(currentDeduction)
				.toNumber();
		}

		// Log deduction details
		if (targetBalance !== undefined) {
			const entityInfo = entityId
				? `; Entity: ${entityId}`
				: "Entity: customer-level";
			ctx.logger.info(`[Redis Sync]; Feature ${feature.id} | ${entityInfo}`, {
				data: {
					featureId: feature.id,
					entityInfo,
					totalDeducted,
					updates: Object.keys(updates).length,
					remaining: featureRemaining,
				},
			});
		} else {
			ctx.logger.info(
				`[Redis Track]; Deducted ${totalDeducted} from feature ${feature.id}. Updated ${Object.keys(updates).length} entitlements. Remaining: ${featureRemaining}`,
			);
		}

		// Handle paid allocated entitlements and update fullCus in memory
		try {
			for (const cusEntId of Object.keys(updates)) {
				const update = updates[cusEntId];
				const cusEnt = cusEnts.find((ce) => ce.id === cusEntId);

				if (!cusEnt) continue;

				await handlePaidAllocatedCusEnt({
					ctx,
					cusEnt,
					fullCus,
					updates,
				});

				updateCusEntInFullCus({
					fullCus,
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
		fullCus,
		actualDeductions,
		remainingAmounts,
		isPaidAllocated,
		modifiedCusEntIds,
	};
};
