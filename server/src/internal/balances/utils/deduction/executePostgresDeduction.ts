import {
	ACTIVE_STATUSES,
	type FullCustomer,
	InternalError,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { withLock } from "@/external/redis/redisUtils.js";
import { rollbackDeduction } from "@/internal/balances/utils/paidAllocatedFeature/rollbackDeduction.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { CusService } from "../../../customers/CusService.js";
import type { EventInfo } from "../../events/initEvent.js";
import { applyDeductionUpdateToFullCustomer } from "../../utils/deduction/applyDeductionUpdateToFullCustomer.js";
import { saveLockReceipt } from "../../utils/lock/saveLockReceipt.js";
import type { DeductionUpdate } from "../../utils/types/deductionUpdate.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import type { MutationLogItem } from "../../utils/types/mutationLogItem.js";
import { createAllocatedInvoice } from "../allocatedInvoice/createAllocatedInvoice.js";
import { CascadeSpill } from "../deductionV2/cascadeSpill.js";
import { attachCascadeReplayState } from "../types/cascadeReplayState.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import { applyRolloverUpdatesToFullCustomer } from "./applyRolloverUpdatesToFullCustomer.js";
import {
	type DeductionSideEffect,
	flushDeductionSideEffects,
	queueDeductionSideEffect,
} from "./deductionSideEffects.js";
import {
	type RolloverOverwrite,
	syncCustomerEntitlementUpdatesToCache,
} from "./executeDeductionCache.js";
import { logDeductionUpdates } from "./logDeductionUpdates.js";
import { mutationLogsToFeatures } from "./mutationLogsToFeatures.js";
import { prepareDeductionOptions } from "./prepareDeductionOptions.js";
import { prepareFeatureDeduction } from "./prepareFeatureDeduction.js";

export const executePostgresDeduction = async ({
	ctx,
	fullCustomer,
	customerId,
	entityId,
	deductions,
	options = {},
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	fullCustomer?: FullCustomer; // if provided from function above!
	deductions: FeatureDeduction[];
	eventInfo?: EventInfo;
	options?: DeductionOptions;
}): Promise<{
	oldFullCus: FullCustomer;
	fullCus: FullCustomer | undefined;
	updates: Record<string, DeductionUpdate>;
	mutationLogs: MutationLogItem[];
}> => {
	const { db, org, env } = ctx;

	ctx.logger.info(
		`executing postgres deduction, deductions: ${JSON.stringify(
			deductions.map((d) => ({
				featureId: d.feature.id,
				deduction: d.deduction,
				targetBalance: d.targetBalance,
			})),
		)}`,
	);

	if (!fullCustomer) {
		fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ACTIVE_STATUSES,
			entityId,
			withSubs: true,
		});
	}
	const oldFullCus = structuredClone(fullCustomer);

	const resolvedOptions = prepareDeductionOptions({
		options,
		fullCustomer,
		deductions,
	});

	if (resolvedOptions.paidAllocatedV1 && deductions.some((d) => d.lock)) {
		throw new InternalError({
			message: "Locks are not supported for paid allocated features",
		});
	}

	const executeDeduction = async (): Promise<{
		updates: Record<string, DeductionUpdate>;
		mutationLogs: MutationLogItem[];
	}> => {
		let allUpdates: Record<string, DeductionUpdate> = {};
		let allRolloverOverwrites: RolloverOverwrite[] = [];
		let allMutationLogs: MutationLogItem[] = [];
		const sideEffects: DeductionSideEffect[] = [];

		const cascadeSpill = new CascadeSpill();

		try {
			for (const deduction of deductions) {
				const {
					feature,
					deduction: toDeduct,
					targetBalance,
					lockReceipt,
					unwindValue,
				} = deduction;

				const effectiveToDeduct =
					deduction.cascade?.role === "overage"
						? cascadeSpill.effectiveAmount({ deduction })
						: toDeduct;
				if (deduction.cascade?.role === "overage" && effectiveToDeduct === 0) {
					continue;
				}
				const legOverageBehaviour = cascadeSpill.effectiveOverageBehaviour({
					deduction,
					requestBehaviour: resolvedOptions.overageBehaviour,
				});

				const {
					customerEntitlementDeductions,
					spendLimitByFeatureId,
					usageBasedCusEntIdsByFeatureId,
					rollovers,
					customerEntitlements,
					unlimitedFeatureIds,
					lock: preparedLock,
				} = prepareFeatureDeduction({
					ctx,
					fullCustomer,
					deduction,
					options: { ...options, overageBehaviour: legOverageBehaviour },
				});

			if (unlimitedFeatureIds.length > 0) {
				if (preparedLock?.enabled) {
					await saveLockReceipt({
						lock: preparedLock,
						customerId: fullCustomer.id || customerId,
						featureId: feature.id,
						entityId,
						items: [],
						overrideLockValue: effectiveToDeduct,
					});
				}
				cascadeSpill.recordIncludedResult({
					deduction,
					remaining: 0,
					mutationLogs: [],
				});
				continue;
			}

			if (customerEntitlements.length === 0) {
				if (deduction.cascade?.role === "overage") {
					throw new InternalError({
						message: `INSUFFICIENT_BALANCE|featureId:${feature.id}|value:${effectiveToDeduct}`,
					});
				}
				cascadeSpill.recordIncludedResult({
					deduction,
					remaining: deduction.deduction,
					mutationLogs: [],
				});
				continue;
			}

				const result = await db.execute(
					sql`SELECT * FROM deduct_from_cus_ents(
				${JSON.stringify({
					sorted_entitlements: customerEntitlementDeductions,
					spend_limit_by_feature_id: spendLimitByFeatureId ?? null,
					usage_based_cus_ent_ids_by_feature_id:
						usageBasedCusEntIdsByFeatureId ?? null,
					amount_to_deduct: effectiveToDeduct ?? null,
					target_balance: targetBalance ?? null,
					lock_receipt: lockReceipt ?? null,
					unwind_value: unwindValue ?? null,
					unwind_items: deduction.unwindItems ?? null,
					target_entity_id: entityId || null,
					rollovers: rollovers.length > 0 ? rollovers : null,
					cus_ent_ids: customerEntitlements.map((ce) => ce.id),
					skip_additional_balance: resolvedOptions.skipAdditionalBalance,
					alter_granted_balance: resolvedOptions.alterGrantedBalance,
					overage_behaviour: legOverageBehaviour,
					feature_id: feature.id,
				})}::jsonb
			)`,
				);

				const resultJson = result[0]?.deduct_from_cus_ents as {
					updates: Record<string, DeductionUpdate>;
					remaining: number;
					rollover_updates: RolloverOverwrite[];
					mutation_logs: MutationLogItem[];
				};

				if (!resultJson) {
					throw new InternalError({
						message: "Failed to deduct from entitlements",
					});
				}

				const { updates, rollover_updates, mutation_logs } = resultJson;
				logDeductionUpdates({
					ctx,
					fullCustomer,
					updates,
					source: "executePostgresDeduction",
				});
				allUpdates = { ...allUpdates, ...updates };
				allMutationLogs = [...allMutationLogs, ...(mutation_logs ?? [])];
				if (rollover_updates?.length > 0) {
					allRolloverOverwrites = [
						...allRolloverOverwrites,
						...rollover_updates,
					];
				}

				try {
					applyRolloverUpdatesToFullCustomer({
						fullCus: fullCustomer,
						rolloverUpdates: Object.fromEntries(
							(rollover_updates ?? []).map((rollover) => [
								rollover.id,
								{
									balance: rollover.balance,
									usage: rollover.usage,
									entities: rollover.entities,
								},
							]),
						),
					});

					for (const cusEntId of Object.keys(updates)) {
						const update = updates[cusEntId];
						const cusEnt = customerEntitlements.find(
							(ce) => ce.id === cusEntId,
						);

						if (!cusEnt) continue;

						await createAllocatedInvoice({
							ctx,
							customerEntitlement: cusEnt,
							oldFullCustomer: oldFullCus,
							update,
						});

						applyDeductionUpdateToFullCustomer({
							fullCus: fullCustomer,
							cusEntId,
							update,
						});
					}

					if (preparedLock?.enabled) {
						await saveLockReceipt({
							lock: preparedLock,
							customerId: fullCustomer.id || customerId,
							featureId: feature.id,
							entityId,
							items: mutation_logs ?? [],
						});
					}
				} catch (error) {
					if (error instanceof Error && !error?.message?.includes("declined")) {
						ctx.logger.error(
							`[deductFromCusEnts] Attempting rollback due to error: ${error}`,
						);
					}
					await rollbackDeduction({
						ctx,
						oldFullCus,
						updates,
					});
					throw error;
				}

				cascadeSpill.recordIncludedResult({
					deduction,
					remaining: resultJson.remaining,
					mutationLogs: mutation_logs ?? [],
				});

				const featuresFromMutationLogs = mutationLogsToFeatures({
					fullCustomer,
					mutationLogs: mutation_logs ?? [],
				});

				if (resolvedOptions.triggerSideEffects) {
					queueDeductionSideEffect({
						sideEffect: {
							oldFullCus,
							newFullCus: fullCustomer,
							feature: deduction.feature,
							entityId,
							featuresFromMutationLogs,
							triggerAutoTopUp: resolvedOptions.triggerAutoTopUp,
						},
						sideEffects,
					});
				}
			}
		} catch (error) {
			await compensateCascadeIncludedLeg({
				ctx,
				fullCustomer,
				customerId,
				entityId,
				cascadeSpill,
			});
			attachCascadeReplayState({
				error,
				state: cascadeSpill.buildReplayState(),
			});
			throw error;
		} finally {
			flushDeductionSideEffects({
				ctx,
				sideEffects,
				source: "executePostgresDeduction",
			});
		}

		// Atomically update the Redis cache with the deduction results.
		// Uses the old fullCustomer's next_reset_at as an optimistic guard
		// to prevent stale writes if a concurrent reset occurred.

		await syncCustomerEntitlementUpdatesToCache({
			ctx,
			customerId,
			fullCustomer: oldFullCus,
			cusEntUpdates: allUpdates,
			rolloverOverwrites: allRolloverOverwrites,
		});

		return {
			updates: allUpdates,
			mutationLogs: allMutationLogs,
		};
	};

	const deductionResult = resolvedOptions.paidAllocatedV1
		? await withLock({
				lockKey: `lock:deduction:${org.id}:${env}:${customerId}`,
				ttlMs: 60000,
				errorMessage: `Deduction for paid feature ${deductions[0]?.feature?.name} already in progress for customer ${customerId}.`,
				fn: executeDeduction,
			})
		: await executeDeduction();

	return {
		oldFullCus,
		fullCus: fullCustomer,
		updates: deductionResult.updates,
		mutationLogs: deductionResult.mutationLogs,
	};
};

/**
 * Restores a cascade's included deduction after a later deduction failed, by
 * replaying the included mutations as an inline unwind via unwind_items.
 * Compensation failures are logged loudly but never mask the original error.
 *
 * Re-enters the executor; safe because AI credit system features are never
 * paidAllocated, so the recursive call cannot contend for the per-customer
 * deduction lock the outer call may hold.
 */
const compensateCascadeIncludedLeg = async ({
	ctx,
	fullCustomer,
	customerId,
	entityId,
	cascadeSpill,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerId: string;
	entityId?: string;
	cascadeSpill: CascadeSpill;
}): Promise<void> => {
	const compensation = cascadeSpill.buildCompensation();
	if (!compensation) return;

	try {
		await executePostgresDeduction({
			ctx,
			fullCustomer,
			customerId,
			entityId,
			deductions: [compensation],
			options: {
				overageBehaviour: "cap",
				triggerAutoTopUp: false,
				triggerSideEffects: false,
			},
		});
	} catch (compensationError) {
		ctx.logger.error(
			`[executePostgresDeduction] cascade compensation failed: ${compensationError}`,
			{
				type: "track_cascade_compensation_failed",
				customer_id: customerId,
				feature_id: compensation.feature.id,
				unwind_value: compensation.unwindValue,
			},
		);
	}
};
