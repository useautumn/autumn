import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	isFreeProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { cusProductsToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";
import { resolveCreateScheduleRecurringProducts } from "../utils/resolveCreateScheduleRecurringProducts";
import { computeImmediatePhaseCustomerProducts } from "./computeImmediatePhaseCustomerProducts";
import { computeScheduledCustomerProducts } from "./computeScheduledCustomerProducts";

export type SchedulePhasePlan = {
	startsAt: number;
	customerProductIds: string[];
};

export type CreateSchedulePlanResult = {
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
};

/** Compute the full create_schedule billing plan (immediate + scheduled phases). */
export const computeCreateSchedulePlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
}): CreateSchedulePlanResult => {
	const nextPhaseStartsAt = billingContext.futurePhases[0]?.starts_at;
	const {
		recurringOutgoing: outgoingCustomerProducts,
		recurringEndingAtPhase,
		recurringScheduled: existingScheduledCustomerProducts,
	} = resolveCreateScheduleRecurringProducts({ billingContext });

	const immediate = computeImmediatePhaseCustomerProducts({
		ctx,
		billingContext,
		currentRecurringCustomerProducts: outgoingCustomerProducts,
		nextPhaseStartsAt,
	});

	const scheduled = computeScheduledCustomerProducts({
		ctx,
		billingContext,
		existingScheduledCustomerProducts,
	});
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts: immediate.insertCustomerProducts,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
		now: billingContext.currentEpochMs,
	});
	const immediateCustomerProducts = immediate.insertCustomerProducts;

	const allInsertCustomerProducts = [
		...immediateCustomerProducts,
		...scheduled.insertCustomerProducts,
	];

	const { allLineItems, updateCustomerEntitlements } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: immediateCustomerProducts,
		deletedCustomerProducts: outgoingCustomerProducts,
		billingContext,
		includeArrearLineItems: outgoingCustomerProducts.length > 0,
	});

	const oneOffPrepaidCarryOvers = cusProductsToOneOffPrepaidCarryOvers({
		currentCustomerProducts: outgoingCustomerProducts,
		fullCustomer: billingContext.fullCustomer,
	});
	const allProductsFree = billingContext.fullProducts.every((product) =>
		isFreeProduct({ product }),
	);
	const lockCustomerCurrency =
		billingContext.currency &&
		!billingContext.fullCustomer.currency &&
		!allProductsFree
			? {
					internalCustomerId: billingContext.fullCustomer.internal_id,
					currency: billingContext.currency,
				}
			: undefined;

	const autumnBillingPlan: AutumnBillingPlan = {
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		// persistCreateSchedule replaces the schedule wholesale and reads the old
		// phases to find it, so nothing may rewrite them mid-flight.
		ownsSchedulePersistence: true,
		insertCustomerProducts: allInsertCustomerProducts,
		updateCustomerProducts: [
			...immediate.updateCustomerProducts,
			...recurringEndingAtPhase.map(({ customerProduct, endsAt }) => ({
				customerProduct,
				updates: { ended_at: endsAt },
			})),
		],
		deleteCustomerProducts: scheduled.deleteCustomerProducts,
		customPrices: billingContext.customPrices,
		customEntitlements: [
			...(billingContext.customEnts ?? []),
			...oneOffPrepaidCarryOvers.entitlements,
		],
		customFreeTrial: billingContext.trialContext?.customFreeTrial,
		lineItems: allLineItems,
		updateCustomerEntitlements,
		insertCustomerEntitlements: oneOffPrepaidCarryOvers.customerEntitlements,
		pooledBalancePlan,
		lockCustomerCurrency,
	};

	autumnBillingPlan.lineItems = finalizeLineItems({
		ctx,
		lineItems: autumnBillingPlan.lineItems ?? [],
		billingContext,
		autumnBillingPlan,
	});

	const immediatePhase: SchedulePhasePlan = {
		startsAt: billingContext.immediatePhase.starts_at,
		customerProductIds: immediate.phaseCustomerProductIds,
	};

	return {
		autumnBillingPlan,
		phases: [immediatePhase, ...scheduled.scheduledPhases],
	};
};
