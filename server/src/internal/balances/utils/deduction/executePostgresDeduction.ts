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
import type { DeductionUpdate } from "../../utils/types/deductionUpdate.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { createAllocatedInvoice } from "../allocatedInvoice/createAllocatedInvoice.js";
import { handleThresholdReached } from "../handleThresholdReached.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import {
	type RolloverOverwrite,
	syncCustomerEntitlementUpdatesToCache,
} from "./executeDeductionCache.js";
import { logDeductionUpdates } from "./logDeductionUpdates.js";
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

	// Need to getOrCreateCustomer here too...
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

	const executeDeduction = async (): Promise<
		Record<string, DeductionUpdate>
	> => {
		let allUpdates: Record<string, DeductionUpdate> = {};
		let allRolloverOverwrites: RolloverOverwrite[] = [];

		// Need to deduct from customer entitlement...
		for (const deduction of deductions) {
			const { feature, deduction: toDeduct, targetBalance } = deduction;

			const {
				customerEntitlementDeductions,
				rollovers,
				customerEntitlements,
				unlimitedFeatureIds,
			} = prepareFeatureDeduction({
				ctx,
				fullCustomer,
				deduction,
				options,
			});

			if (customerEntitlements.length === 0 || unlimitedFeatureIds.length > 0)
				continue;

			// Call the stored function to deduct from entitlements with credit costs
			const result = await db.execute(
				sql`SELECT * FROM deduct_from_cus_ents(
				${JSON.stringify({
					sorted_entitlements: customerEntitlementDeductions,
					amount_to_deduct: toDeduct ?? null,
					target_balance: targetBalance ?? null,
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

			// Parse the JSONB result
			const resultJson = result[0]?.deduct_from_cus_ents as {
				updates: Record<string, DeductionUpdate>;
				remaining: number;
				rollover_updates: RolloverOverwrite[];
			};

			if (!resultJson) {
				throw new InternalError({
					message: "Failed to deduct from entitlements",
				});
			}

			const { updates, rollover_updates } = resultJson;
			logDeductionUpdates({
				ctx,
				fullCustomer,
				updates,
				source: "executePostgresDeduction",
			});
			allUpdates = { ...allUpdates, ...updates };
			if (rollover_updates?.length > 0) {
				allRolloverOverwrites = [...allRolloverOverwrites, ...rollover_updates];
			}

			try {
				for (const cusEntId of Object.keys(updates)) {
					const update = updates[cusEntId];
					const cusEnt = customerEntitlements.find((ce) => ce.id === cusEntId);

					if (!cusEnt) continue;

					await createAllocatedInvoice({
						ctx,
						customerEntitlement: cusEnt,
						fullCustomer,
						update,
					});

					// await handlePaidAllocatedCusEnt({
					// 	ctx,
					// 	cusEnt,
					// 	fullCus: fullCustomer,
					// 	updates,
					// });

					applyDeductionUpdateToFullCustomer({
						fullCus: fullCustomer,
						cusEntId,
						update,
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

			handleThresholdReached({
				ctx,
				oldFullCus,
				newFullCus: fullCustomer,
				feature: deduction.feature,
			}).catch((error) => {
				ctx.logger.error(
					`[executeRedisDeduction] Failed to handle threshold reached: ${error}`,
				);
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

		return allUpdates;
	};

	const allUpdates = resolvedOptions.paidAllocated
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
		updates: allUpdates,
	};
};
