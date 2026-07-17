import type { FullCustomer } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isSyncConflictError } from "@/internal/balances/utils/sync/flushSubjectBalancesToDb.js";
import { writeFullCustomerBalancesToDb } from "@/internal/balances/utils/sync/syncItemV3.js";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import type { DeductionOptions } from "@/internal/balances/utils/types/deductionTypes.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { deleteLegacyCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { executeRedisDeduction } from "./executeRedisDeduction.js";

export type ExecuteLegacyRedisDeductionWithBalanceSyncDependencies = {
	executeRedisDeduction: typeof executeRedisDeduction;
	writeFullCustomerBalancesToDb: typeof writeFullCustomerBalancesToDb;
	invalidateLegacyCache: typeof deleteLegacyCachedFullCustomer;
};

/**
 * Makes a legacy FullCustomer Redis mutation durable before pooled lifecycle
 * code can delete that cache view. This must wrap even currently non-pooled
 * customers: their first pooled attachment can otherwise delete a just-mutated
 * cache before the queued legacy sync reads it.
 */
export const executeLegacyRedisDeductionWithBalanceSyncWithDependencies =
	async ({
		ctx,
		fullCustomer,
		featureDeductions,
		overageBehavior,
		deductionOptions,
		entityId = fullCustomer.entity?.id ?? undefined,
		redisInstance,
		dependencies = {
			executeRedisDeduction,
			writeFullCustomerBalancesToDb,
			invalidateLegacyCache: deleteLegacyCachedFullCustomer,
		},
	}: {
		ctx: AutumnContext;
		fullCustomer: FullCustomer;
		featureDeductions: FeatureDeduction[];
		overageBehavior?: "cap" | "reject";
		deductionOptions?: DeductionOptions;
		entityId?: string;
		redisInstance?: Redis;
		dependencies?: ExecuteLegacyRedisDeductionWithBalanceSyncDependencies;
	}) => {
		const customerId = fullCustomer.id || fullCustomer.internal_id;
		let deductionResult:
			| Awaited<ReturnType<typeof executeRedisDeduction>>
			| undefined;

		try {
			return await withCustomerBalanceSyncLock({
				ctx,
				customerId,
				internalCustomerId: fullCustomer.internal_id,
				callback: async ({ db }) => {
					deductionResult = await dependencies.executeRedisDeduction({
						ctx,
						fullCustomer,
						entityId,
						deductions: featureDeductions,
						deductionOptions: deductionOptions ?? {
							overageBehaviour: overageBehavior ?? "cap",
							triggerAutoTopUp: true,
						},
						redisInstance,
					});
					const customerEntitlementIds = Object.keys(deductionResult.updates);
					const rolloverIds = Object.keys(deductionResult.rolloverUpdates);

					if (customerEntitlementIds.length > 0 || rolloverIds.length > 0) {
						await dependencies.writeFullCustomerBalancesToDb({
							ctx,
							db,
							customerId,
							fullCustomer: deductionResult.fullCus ?? fullCustomer,
							cusEntIds: customerEntitlementIds,
							rolloverIds,
						});
					}

					return deductionResult;
				},
				onTransactionFailure: () =>
					dependencies.invalidateLegacyCache({
						ctx,
						customerId,
						source: "legacy-redis-balance-sync-failure",
					}),
			});
		} catch (error) {
			if (
				deductionResult &&
				error instanceof Error &&
				isSyncConflictError(error)
			) {
				return deductionResult;
			}
			throw error;
		}
	};

export const executeLegacyRedisDeductionWithBalanceSync = async ({
	ctx,
	fullCustomer,
	featureDeductions,
	overageBehavior,
	deductionOptions,
	entityId,
	redisInstance,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureDeductions: FeatureDeduction[];
	overageBehavior?: "cap" | "reject";
	deductionOptions?: DeductionOptions;
	entityId?: string;
	redisInstance?: Redis;
}) =>
	executeLegacyRedisDeductionWithBalanceSyncWithDependencies({
		ctx,
		fullCustomer,
		featureDeductions,
		overageBehavior,
		deductionOptions,
		entityId,
		redisInstance,
	});
