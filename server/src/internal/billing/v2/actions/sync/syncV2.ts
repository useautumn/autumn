import { CusProductStatus, type SyncParamsV1 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { persistCreateSchedule } from "@/internal/billing/v2/actions/createSchedule/utils/persistCreateSchedule";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { reconcileLicenseStateForCustomer } from "@/internal/licenses/actions/reconcile/reconcileLicenseState";
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
 */
export const syncV2 = async ({
	ctx,
	params,
	tags,
}: {
	ctx: AutumnContext;
	params: SyncParamsV1;
	tags?: string[];
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
	if ((autumnBillingPlan.customerLicenseUpdates?.length ?? 0) > 0) {
		await reconcileLicenseStateForCustomer({
			ctx,
			idOrInternalId: syncContext.customer_id,
			deleteCache: true,
		});
	}

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

	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan,
		originalFullCustomer: syncContext.fullCustomer,
		tags,
	});

	const customerProductUpdates = (
		autumnBillingPlan.updateCustomerProducts ?? []
	).concat(
		autumnBillingPlan.updateCustomerProduct
			? [autumnBillingPlan.updateCustomerProduct]
			: [],
	);

	return {
		customer_id: syncContext.customer_id,
		stripe_subscription_id: syncContext.stripeSubscription?.id ?? null,
		stripe_schedule_id: syncContext.stripeSchedule?.id ?? null,
		inserted_cus_product_ids: autumnBillingPlan.insertCustomerProducts.map(
			(cp) => cp.id,
		),
		expired_cus_product_ids: customerProductUpdates
			.filter(({ updates }) => updates.status === CusProductStatus.Expired)
			.map((u) => u.customerProduct.id),
		schedule_id: scheduleId,
		scheduled_phases: scheduledPhases,
	};
};
