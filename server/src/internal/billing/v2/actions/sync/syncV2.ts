import type { SyncParamsV1 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { persistCreateSchedule } from "@/internal/billing/v2/actions/createSchedule/utils/persistCreateSchedule";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { computeSyncPlan } from "./compute/computeSyncPlan";
import { handleSyncErrors } from "./errors/handleSyncErrors";
import { logSyncContext } from "./logs/logSyncContext";
import { logSyncPlan } from "./logs/logSyncPlan";
import { setupSyncContext } from "./setup/setupSyncContext";

export type SyncV2PersistedPhase = {
	phase_id: string;
	starts_at: number;
	customer_product_ids: string[];
};

export type SyncV2Result = {
	customer_id: string;
	stripe_subscription_id: string | null;
	stripe_schedule_id: string | null;
	inserted_cus_product_ids: string[];
	expired_cus_product_ids: string[];
	schedule_id: string | null;
	scheduled_phases: SyncV2PersistedPhase[];
};

/**
 * Sync a Stripe subscription/schedule into Autumn state.
 *
 * Mirrors the v2 action convention used by createSchedule.ts:
 *   1. setup   — fetch sub, schedule, customer, products
 *   2. errors  — validate inputs against detection result
 *   3. compute — apply caller overrides and produce an AutumnBillingPlan
 *   4. execute — run the billing plan (cusProduct inserts/updates)
 *   5. persist — write any scheduled phase rows (reuses createSchedule's
 *                `persistCreateSchedule` so the schedule + schedule_phases
 *                tables are written identically across actions)
 */
export const syncV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncParamsV1;
}): Promise<SyncV2Result> => {
	// 1. Setup
	const syncContext = await setupSyncContext({ ctx, params });
	logSyncContext({ ctx, syncContext });

	// 2. Errors
	handleSyncErrors({ syncContext });

	// 3. Compute
	const { autumnBillingPlan, phases } = computeSyncPlan({ ctx, syncContext });
	logSyncPlan({ ctx, autumnBillingPlan, phases });

	// 4. Execute
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan });

	// 5. Persist scheduled phases (only when sync produced more than one phase)
	let scheduleId: string | null = null;
	let scheduledPhases: SyncV2PersistedPhase[] = [];
	if (phases.length > 0) {
		const persisted = await persistCreateSchedule({
			ctx,
			customerId: syncContext.customer_id,
			currentEpochMs: syncContext.currentEpochMs,
			fullCustomer: syncContext.fullCustomer,
			phases,
		});
		scheduleId = persisted.scheduleId;
		scheduledPhases = persisted.insertedPhases;
	}

	return {
		customer_id: syncContext.customer_id,
		stripe_subscription_id: syncContext.stripeSubscription?.id ?? null,
		stripe_schedule_id: syncContext.stripeSchedule?.id ?? null,
		inserted_cus_product_ids: autumnBillingPlan.insertCustomerProducts.map(
			(cp) => cp.id,
		),
		expired_cus_product_ids: (autumnBillingPlan.updateCustomerProducts ?? [])
			.concat(
				autumnBillingPlan.updateCustomerProduct
					? [autumnBillingPlan.updateCustomerProduct]
					: [],
			)
			.map((u) => u.customerProduct.id),
		schedule_id: scheduleId,
		scheduled_phases: scheduledPhases,
	};
};
