import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type Subscription,
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
import {
	computeSyncImmediatePhase,
	computeSyncUnscheduledPlans,
	type ImmediatePhaseResult,
} from "./computeSyncImmediatePhase";
import { computeUnlistedCustomerProductExpiries } from "./computeUnlistedCustomerProductExpiries";

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

const combineStartingNowResults = (
	results: ImmediatePhaseResult[],
): ImmediatePhaseResult => ({
	insertCustomerProducts: results.flatMap((r) => r.insertCustomerProducts),
	updateCustomerProducts: results.flatMap((r) => r.updateCustomerProducts),
	customPrices: results.flatMap((r) => r.customPrices),
	customEntitlements: results.flatMap((r) => r.customEntitlements),
	insertPlanLicenses: results.flatMap((r) => r.insertPlanLicenses),
	customerLicenseUpdates: results.flatMap((r) => r.customerLicenseUpdates),
});

/** Compose the AutumnBillingPlan from the immediate + future phase computations. */
export const computeSyncPlan = ({
	ctx,
	syncContext,
}: {
	ctx: AutumnContext;
	syncContext: SyncBillingContext;
}): ComputedSyncPlan => {
	const immediatePhase = computeSyncImmediatePhase({ ctx, syncContext });
	// Unscheduled plans start now too, but sit outside every schedule phase.
	const immediate = combineStartingNowResults([
		immediatePhase,
		computeSyncUnscheduledPlans({ ctx, syncContext }),
	]);
	const future = computeSyncFuturePhases({ ctx, syncContext });
	immediate.updateCustomerProducts.push(
		...computeUnlistedCustomerProductExpiries({
			syncContext,
			updateCustomerProducts: [
				...immediate.updateCustomerProducts,
				...future.updateCustomerProducts,
			],
		}),
	);
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

	const { stripeSubscription } = syncContext;
	const upsertSubscriptions: Subscription[] = [];
	if (stripeSubscription) {
		upsertSubscriptions.push(
			initSubscriptionFromStripe({ ctx, stripeSubscription }),
		);
	}

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
		// Saving the new schedule replaces the old one and the plans it had queued,
		// so the old schedule's phases must not be re-pointed at this sync's plans.
		...(hasMultiplePhases({ syncContext })
			? {
					deleteCustomerProducts: syncContext.queuedCustomerProducts,
					ownsSchedulePersistence: true,
				}
			: {}),
		lockCustomerCurrency: syncContextToCurrencyLock({ syncContext }),
		upsertSubscriptions,
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
					customerProductIds: immediatePhase.insertCustomerProducts.map(
						(cp) => cp.id,
					),
				}
			: null;

	const phases = immediateDescriptor
		? [immediateDescriptor, ...future.scheduledPhases]
		: future.scheduledPhases;

	return { autumnBillingPlan, phases };
};
