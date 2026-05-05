import type { AutumnBillingPlan, SyncBillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe";
import {
	type ComputedSchedulePhase,
	computeSyncFuturePhases,
} from "./computeSyncFuturePhases";
import { computeSyncImmediatePhase } from "./computeSyncImmediatePhase";

export type { ComputedSchedulePhase } from "./computeSyncFuturePhases";

export type ComputedSyncPlan = {
	autumnBillingPlan: AutumnBillingPlan;
	/**
	 * Phase descriptors for `persistSyncPhases` to write. Empty when the
	 * sync is single-phase (immediate-only or schedule-only with one phase) —
	 * in that case no Autumn schedule is created.
	 */
	phases: ComputedSchedulePhase[];
};

const hasMultiplePhases = ({
	syncContext,
}: {
	syncContext: SyncBillingContext;
}): boolean =>
	(syncContext.immediatePhase ? 1 : 0) + syncContext.futurePhases.length > 1;

/** Compose the AutumnBillingPlan from the immediate + future phase computations. */
export const computeSyncPlan = ({
	ctx,
	syncContext,
}: {
	ctx: AutumnContext;
	syncContext: SyncBillingContext;
}): ComputedSyncPlan => {
	const immediate = computeSyncImmediatePhase({ ctx, syncContext });
	const future = computeSyncFuturePhases({ ctx, syncContext });

	const upsertSubscription = syncContext.stripeSubscription
		? initSubscriptionFromStripe({
				ctx,
				stripeSubscription: syncContext.stripeSubscription,
			})
		: undefined;

	const autumnBillingPlan: AutumnBillingPlan = {
		customerId:
			syncContext.fullCustomer.id ?? syncContext.fullCustomer.internal_id,
		insertCustomerProducts: [
			...immediate.insertCustomerProducts,
			...future.insertCustomerProducts,
		],
		updateCustomerProducts:
			immediate.updateCustomerProducts.length > 0
				? immediate.updateCustomerProducts
				: undefined,
		customPrices: [...immediate.customPrices, ...future.customPrices],
		customEntitlements: [
			...immediate.customEntitlements,
			...future.customEntitlements,
		],
		upsertSubscription,
	};

	// Single-phase sync (no schedule) → don't materialize any Autumn schedule.
	if (!hasMultiplePhases({ syncContext })) {
		return { autumnBillingPlan, phases: [] };
	}

	const immediateDescriptor: ComputedSchedulePhase | null =
		syncContext.immediatePhase
			? {
					startsAt: syncContext.immediatePhase.startsAt,
					endsAt: syncContext.immediatePhase.endsAt,
					customerProductIds: immediate.insertCustomerProducts.map(
						(cp) => cp.id,
					),
				}
			: null;

	const phases = immediateDescriptor
		? [immediateDescriptor, ...future.scheduledPhases]
		: future.scheduledPhases;

	return { autumnBillingPlan, phases };
};
