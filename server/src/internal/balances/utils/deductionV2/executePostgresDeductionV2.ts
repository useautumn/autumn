import {
	type EntityRolloverBalance,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToFullCustomer,
	InternalError,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { triggerAutoTopUp } from "@/internal/balances/autoTopUp/triggerAutoTopUp.js";
import { fireTrackWebhooks } from "@/internal/balances/trackWebhooks/fireTrackWebhooks.js";
import { createAllocatedInvoice } from "@/internal/balances/utils/allocatedInvoice/createAllocatedInvoice.js";
import { saveLockReceipt } from "@/internal/balances/utils/lock/saveLockReceipt.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";
import type { MutationLogItem } from "../types/mutationLogItem.js";
import { applyDeductionUpdateToFullSubject } from "./applyDeductionUpdateToFullSubject.js";
import { applyRolloverUpdatesToFullSubject } from "./applyRolloverUpdatesToFullSubject.js";
import { logDeductionUpdatesV2 } from "./logDeductionUpdatesV2.js";
import { mutationLogsToFeaturesV2 } from "./mutationLogsToFeaturesV2.js";
import { normalizeDeductionSyncStateV2 } from "./normalizeDeductionSyncStateV2.js";
import { prepareDeductionOptionsV2 } from "./prepareDeductionOptionsV2.js";
import { prepareFeatureDeductionV2 } from "./prepareFeatureDeductionV2.js";
import { rollbackDeductionV2 } from "./rollbackDeductionV2.js";
import { syncDeductionUpdatesToFullSubjectCache } from "./syncDeductionUpdatesToFullSubjectCache.js";

interface RolloverOverwrite {
	id: string;
	cus_ent_id: string;
	balance: number;
	usage: number;
	entities: Record<string, EntityRolloverBalance>;
}

export const executePostgresDeductionV2 = async ({
	ctx,
	fullSubject,
	customerId,
	entityId,
	deductions,
	options = {},
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	fullSubject: FullSubject;
	deductions: FeatureDeduction[];
	options?: DeductionOptions;
}): Promise<{
	oldFullSubject: FullSubject;
	fullSubject: FullSubject;
	updates: Record<string, DeductionUpdate>;
	mutationLogs: MutationLogItem[];
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
}> => {
	const { db, org, env } = ctx;

	ctx.logger.info(
		`executing postgres deduction v2, deductions: ${JSON.stringify(
			deductions.map((d) => ({
				featureId: d.feature.id,
				deduction: d.deduction,
				targetBalance: d.targetBalance,
			})),
		)}`,
	);

	const oldFullSubject = structuredClone(fullSubject);

	const resolvedOptions = prepareDeductionOptionsV2({
		ctx,
		fullSubject,
		options,
		deductions,
	});

	if (resolvedOptions.paidAllocated && deductions.some((d) => d.lock)) {
		throw new InternalError({
			message: "Locks are not supported for paid allocated features",
		});
	}

	const executeDeduction = async (): Promise<{
		updates: Record<string, DeductionUpdate>;
		mutationLogs: MutationLogItem[];
		modifiedCusEntIdsByFeatureId: Record<string, string[]>;
	}> => {
		let allUpdates: Record<string, DeductionUpdate> = {};
		let allSyncUpdates: Record<string, DeductionUpdate> = {};
		let allRolloverOverwrites: RolloverOverwrite[] = [];
		let allMutationLogs: MutationLogItem[] = [];
		const allModifiedCusEntIdsByFeatureId: Record<string, string[]> = {};

		for (const deduction of deductions) {
			const {
				feature,
				deduction: toDeduct,
				targetBalance,
				lockReceipt,
				unwindValue,
			} = deduction;

			const {
				customerEntitlementDeductions,
				spendLimitByFeatureId,
				usageBasedCusEntIdsByFeatureId,
				rollovers,
				customerEntitlements,
				unlimitedFeatureIds,
				lock: preparedLock,
			} = prepareFeatureDeductionV2({
				ctx,
				fullSubject,
				deduction,
				options: resolvedOptions,
			});

			if (customerEntitlements.length === 0 || unlimitedFeatureIds.length > 0)
				continue;

			const result = await db.execute(
				sql`SELECT * FROM deduct_from_cus_ents(
				${JSON.stringify({
					sorted_entitlements: customerEntitlementDeductions,
					spend_limit_by_feature_id: spendLimitByFeatureId ?? null,
					usage_based_cus_ent_ids_by_feature_id:
						usageBasedCusEntIdsByFeatureId ?? null,
					amount_to_deduct: toDeduct ?? null,
					target_balance: targetBalance ?? null,
					lock_receipt: lockReceipt ?? null,
					unwind_value: unwindValue ?? null,
					target_entity_id: entityId || null,
					rollovers: rollovers.length > 0 ? rollovers : null,
					cus_ent_ids: customerEntitlements.map((ce) => ce.id),
					skip_additional_balance: resolvedOptions.skipAdditionalBalance,
					alter_granted_balance: resolvedOptions.alterGrantedBalance,
					overage_behaviour: resolvedOptions.overageBehaviour,
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

			logDeductionUpdatesV2({
				ctx,
				fullSubject,
				updates,
				source: "executePostgresDeductionV2",
			});
			allUpdates = { ...allUpdates, ...updates };
			allMutationLogs = [...allMutationLogs, ...(mutation_logs ?? [])];
			if (rollover_updates?.length > 0) {
				allRolloverOverwrites = [...allRolloverOverwrites, ...rollover_updates];
			}

			const syncState = normalizeDeductionSyncStateV2({
				customerEntitlements,
				updates,
				mutationLogs: mutation_logs ?? [],
				syncUpdates: allSyncUpdates,
				modifiedCusEntIdsByFeatureId: allModifiedCusEntIdsByFeatureId,
			});
			allSyncUpdates = syncState.syncUpdates;
			Object.assign(
				allModifiedCusEntIdsByFeatureId,
				syncState.modifiedCusEntIdsByFeatureId,
			);

			const oldFullCustomer = fullSubjectToFullCustomer({
				fullSubject: oldFullSubject,
			});

			try {
				applyRolloverUpdatesToFullSubject({
					fullSubject,
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

				for (const customerEntitlementId of Object.keys(updates)) {
					const update = updates[customerEntitlementId];
					const customerEntitlement = customerEntitlements.find(
						(ce: FullCusEntWithFullCusProduct) =>
							ce.id === customerEntitlementId,
					);

					if (!customerEntitlement) continue;

					await createAllocatedInvoice({
						ctx,
						customerEntitlement,
						oldFullCustomer,
						update,
					});

					applyDeductionUpdateToFullSubject({
						fullSubject,
						customerEntitlementId,
						update,
					});
				}

				if (preparedLock?.enabled) {
					await saveLockReceipt({
						lock: preparedLock,
						customerId: fullSubject.customerId || customerId,
						featureId: feature.id,
						entityId,
						items: mutation_logs ?? [],
					});
				}
			} catch (error) {
				if (error instanceof Error && !error?.message?.includes("declined")) {
					ctx.logger.error(
						`[executePostgresDeductionV2] Attempting rollback due to error: ${error}`,
					);
				}
				await rollbackDeductionV2({
					ctx,
					oldFullSubject,
					updates,
				});
				throw error;
			}

			const featuresFromMutationLogs = mutationLogsToFeaturesV2({
				fullSubject,
				mutationLogs: mutation_logs ?? [],
			});

			const newFullCustomer = fullSubjectToFullCustomer({ fullSubject });

			fireTrackWebhooks({
				ctx,
				oldFullCus: oldFullCustomer,
				newFullCus: newFullCustomer,
				feature: deduction.feature,
				entityId,
				featuresFromMutationLogs,
			});

			if (resolvedOptions.triggerAutoTopUp) {
				triggerAutoTopUp({
					ctx,
					newFullCus: newFullCustomer,
					feature: deduction.feature,
				}).catch((error) => {
					ctx.logger.error(
						`[executePostgresDeductionV2] Failed to trigger auto top-up: ${error}`,
					);
				});
			}
		}

		await syncDeductionUpdatesToFullSubjectCache({
			ctx,
			customerId,
			fullSubject: oldFullSubject,
			cusEntUpdates: allSyncUpdates,
			rolloverOverwrites: allRolloverOverwrites,
			modifiedCusEntIdsByFeatureId: allModifiedCusEntIdsByFeatureId,
		});

		return {
			updates: allUpdates,
			mutationLogs: allMutationLogs,
			modifiedCusEntIdsByFeatureId: allModifiedCusEntIdsByFeatureId,
		};
	};

	const deductionResult = resolvedOptions.paidAllocated
		? await withLock({
				lockKey: `lock:deduction:${org.id}:${env}:${customerId}`,
				ttlMs: 60000,
				errorMessage: `Deduction for paid feature ${deductions[0]?.feature?.name} already in progress for customer ${customerId}.`,
				fn: executeDeduction,
			})
		: await executeDeduction();

	return {
		oldFullSubject,
		fullSubject,
		updates: deductionResult.updates,
		mutationLogs: deductionResult.mutationLogs,
		modifiedCusEntIdsByFeatureId: deductionResult.modifiedCusEntIdsByFeatureId,
	};
};
