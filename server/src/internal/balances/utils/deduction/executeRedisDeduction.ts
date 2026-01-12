import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { handlePaidAllocatedCusEnt } from "../../track/trackUtils/handlePaidAllocatedCusEnt.js";
import { rollbackDeduction } from "../../track/trackUtils/rollbackDeduction.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "../types/redisDeductionError.js";
import type {
	LuaDeductionResult,
	RolloverUpdate,
} from "../types/redisDeductionResult.js";
import { applyDeductionUpdateToFullCustomer } from "./applyDeductionUpdateToFullCustomer.js";
import { applyRolloverUpdatesToFullCustomer } from "./applyRolloverUpdatesToFullCustomer.js";
import { logDeductionUpdates } from "./logDeductionUpdates.js";
import { prepareDeductionOptions } from "./prepareDeductionOptions.js";
import { prepareFeatureDeduction } from "./prepareFeatureDeduction.js";

export const executeRedisDeduction = async ({
	ctx,
	entityId,
	deductions,
	fullCustomer,
	deductionOptions = {},
}: {
	ctx: AutumnContext;
	entityId?: string;
	deductions: FeatureDeduction[];
	fullCustomer: FullCustomer;
	deductionOptions?: DeductionOptions;
}): Promise<{
	oldFullCus: FullCustomer;
	fullCus: FullCustomer | undefined;
	updates: Record<string, DeductionUpdate>;
	rolloverUpdates: Record<string, RolloverUpdate>;
}> => {
	const { org, env } = ctx;
	const oldFullCus = structuredClone(fullCustomer);

	const options = prepareDeductionOptions({
		options: deductionOptions,
		fullCustomer,
		deductions,
	});

	if (options.paidAllocated) {
		throw new RedisDeductionError({
			message: `Paid allocated deductions are not supported for Redis`,
			code: RedisDeductionErrorCode.PaidAllocated,
		});
	}

	if (ctx.skipCache) {
		throw new RedisDeductionError({
			message: `Skipping cache is not supported for Redis`,
			code: RedisDeductionErrorCode.SkipCache,
		});
	}

	let allUpdates: Record<string, DeductionUpdate> = {};
	let allRolloverUpdates: Record<string, RolloverUpdate> = {};

	// Build cache key
	const customerId = fullCustomer.id || fullCustomer.internal_id;
	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});

	for (const deduction of deductions) {
		const { feature, deduction: toDeduct, targetBalance } = deduction;

		const {
			customerEntitlementDeductions,
			rolloverIds,
			customerEntitlements,
			unlimitedFeatureIds,
		} = prepareFeatureDeduction({
			ctx,
			fullCustomer,
			deduction,
			options,
		});

		if (unlimitedFeatureIds.length > 0) {
			continue;
		}

		// Call Lua script to deduct from FullCustomer in Redis
		const luaParams = {
			sorted_entitlements: customerEntitlementDeductions,
			amount_to_deduct: toDeduct ?? null,
			target_balance: targetBalance ?? null,
			target_entity_id: entityId || null,
			rollover_ids: rolloverIds.length > 0 ? rolloverIds : null,
			skip_additional_balance: options.skipAdditionalBalance,
			alter_granted_balance: options.alterGrantedBalance,
			overage_behaviour: options.overageBehaviour,
			feature_id: feature.id,
		};

		const result = await tryRedisWrite(() =>
			redis.deductFromCustomerEntitlements(cacheKey, JSON.stringify(luaParams)),
		);

		if (!result) {
			throw new RedisDeductionError({
				message: "Redis not ready for deduction",
				code: RedisDeductionErrorCode.CustomerNotFound,
			});
		}

		const resultJson = JSON.parse(result) as LuaDeductionResult;

		if (resultJson.error) {
			throw new RedisDeductionError({
				message: `Redis deduction failed: ${resultJson.error}`,
				code: resultJson.error as RedisDeductionErrorCode,
			});
		}

		const { updates, rollover_updates, logs } = resultJson;
		logDeductionUpdates({
			ctx,
			fullCustomer,
			updates,
			source: "executeRedisDeduction",
		});

		allUpdates = { ...allUpdates, ...updates };
		allRolloverUpdates = { ...allRolloverUpdates, ...rollover_updates };

		if (logs && logs.length > 0) {
			ctx.logger.debug(`[executeRedisDeduction] Logs: ${logs.join("\n")}`);
		}

		// Handle paid allocated entitlements and update fullCus in memory
		try {
			// Apply rollover updates first
			applyRolloverUpdatesToFullCustomer({
				fullCus: fullCustomer,
				rolloverUpdates: rollover_updates,
			});

			// Apply customer entitlement updates
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
					`[executeRedisDeduction] Attempting rollback due to error: ${error}`,
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
		rolloverUpdates: allRolloverUpdates,
	};
};
