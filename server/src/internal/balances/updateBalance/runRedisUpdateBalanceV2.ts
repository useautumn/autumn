import type { CustomerEntitlementFilters, FullCustomer } from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executePostgresDeduction } from "../utils/deduction/executePostgresDeduction.js";
import { executeRedisDeduction } from "../utils/deduction/executeRedisDeduction.js";
import { deductionUpdatesToModifiedIds } from "../utils/sync/deductionUpdatesToModifiedIds.js";
import { syncItemV3 } from "../utils/sync/syncItemV3.js";
import type { DeductionOptions } from "../utils/types/deductionTypes.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
import { RedisDeductionError } from "../utils/types/redisDeductionError.js";

/**
 * Updates balance in Redis using featureDeductions with targetBalance.
 * Falls back to Postgres if Redis fails with recoverable errors.
 * Syncs to Postgres after successful Redis update.
 */
export const runRedisUpdateBalanceV2 = async ({
	ctx,
	fullCustomer,
	featureDeductions,
	customerEntitlementFilters,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureDeductions: FeatureDeduction[];
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	const { org, env } = ctx;
	const customerId = fullCustomer.id || fullCustomer.internal_id;
	const entityId = fullCustomer.entity?.id;

	const deductionOptions: DeductionOptions = {
		overageBehaviour: "allow", // Allow bypasses granted_balance cap for balance updates
		customerEntitlementFilters,
		alterGrantedBalance: false,
	};

	const { data: result, error } = await tryCatch(
		executeRedisDeduction({
			ctx,
			fullCustomer,
			entityId,
			deductions: featureDeductions,
			deductionOptions,
		}),
	);

	// Handle errors
	if (error) {
		if (error instanceof RedisDeductionError && error.shouldFallback()) {
			// Fallback to Postgres for recoverable errors

			ctx.logger.info(
				`[runRedisUpdateBalanceV2] Falling back to Postgres (${error.code})`,
			);

			await executePostgresDeduction({
				ctx,
				fullCustomer,
				customerId,
				entityId,
				deductions: featureDeductions,
				options: deductionOptions,
			});

			return;
		}

		throw error;
	}

	const { updates } = result;

	// Sync to Postgres (update balance doesn't touch rollovers)
	const modifiedCusEntIds = deductionUpdatesToModifiedIds({ updates });

	if (modifiedCusEntIds.length > 0) {
		await syncItemV3({
			payload: {
				customerId,
				orgId: org.id,
				env,
				cusEntIds: modifiedCusEntIds,
				region: currentRegion,
				timestamp: Date.now(),
			},
			ctx,
		});
	}
};
