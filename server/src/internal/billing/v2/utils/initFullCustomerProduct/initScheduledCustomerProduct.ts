import {
	BillingVersion,
	CusProductStatus,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "./initFullCustomerProduct";

/**
 * Build a Scheduled cusProduct for a future-dated phase.
 *
 * Shared between createSchedule's `computeScheduledCustomerProducts` and
 * sync's `computeSyncFuturePhases` — the per-product init logic is identical
 * regardless of the action that produced the phase context.
 */
export const initScheduledCustomerProduct = ({
	ctx,
	fullCustomer,
	fullProduct,
	featureQuantities,
	startsAt,
	endsAt,
	currentEpochMs,
	subscriptionId,
	subscriptionScheduleId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	startsAt: number;
	endsAt: number | null | undefined;
	currentEpochMs: number;
	/** When syncing from an existing Stripe sub/schedule, link the resulting
	 * scheduled cusProduct back to it so the customer-products view shows the
	 * Stripe linkage and downstream actions (cancel, restore) can find it. */
	subscriptionId?: string;
	subscriptionScheduleId?: string;
}): FullCusProduct => {
	return initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			resetCycleAnchor: startsAt,
			freeTrial: null,
			now: currentEpochMs,
			billingVersion: BillingVersion.V2,
		},
		initOptions: {
			startsAt,
			endedAt: endsAt ?? undefined,
			status: CusProductStatus.Scheduled,
			subscriptionId,
			subscriptionScheduleId,
		},
	});
};
