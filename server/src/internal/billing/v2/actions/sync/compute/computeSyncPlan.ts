import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type SyncBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe";
import { syncContextToCurrencyLock } from "../utils/syncContextUtils";
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
	const outgoingCustomerProducts: FullCusProduct[] = [];
	for (const { customerProduct, updates } of [
		...immediate.updateCustomerProducts,
		...future.updateCustomerProducts,
	]) {
		if (updates.status === CusProductStatus.Expired) {
			outgoingCustomerProducts.push(customerProduct);
		}
	}
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: syncContext.fullCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts: immediate.insertCustomerProducts,
		now: syncContext.currentEpochMs,
	});
	const preparedImmediateCustomerProducts = immediate.insertCustomerProducts;

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
			...preparedImmediateCustomerProducts,
			...future.insertCustomerProducts,
		],
		updateCustomerProducts:
			immediate.updateCustomerProducts.length > 0 ||
			future.updateCustomerProducts.length > 0
				? [
						...immediate.updateCustomerProducts,
						...future.updateCustomerProducts,
					]
				: undefined,
		customPrices: [...immediate.customPrices, ...future.customPrices],
		customEntitlements: [
			...immediate.customEntitlements,
			...future.customEntitlements,
		],
		insertPlanLicenses:
			immediate.insertPlanLicenses.length > 0
				? immediate.insertPlanLicenses
				: undefined,
		customerLicenseUpdates:
			immediate.customerLicenseUpdates.length > 0
				? immediate.customerLicenseUpdates
				: undefined,
		lockCustomerCurrency: syncContextToCurrencyLock({ syncContext }),
		upsertSubscription,
		pooledBalancePlan,
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
					customerProductIds: preparedImmediateCustomerProducts.map(
						(cp) => cp.id,
					),
				}
			: null;

	const phases = immediateDescriptor
		? [immediateDescriptor, ...future.scheduledPhases]
		: future.scheduledPhases;

	return { autumnBillingPlan, phases };
};
