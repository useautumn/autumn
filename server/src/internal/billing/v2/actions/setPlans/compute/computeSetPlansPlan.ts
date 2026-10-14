import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	type FullCusProduct,
	isCustomerProductTrialing,
	isFreeProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isUnbilledByStripe } from "@/internal/billing/v2/actions/setPlans/utils/isUnbilledByStripe";
import { carriesUsageFrom } from "@/internal/billing/v2/compute/carryOverUsages/carriesUsageFrom";
import { applyBillingCycleAnchorToSharedSubscription } from "@/internal/billing/v2/compute/computeAutumnUtils/applyBillingCycleAnchorToSharedSubscription";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { cusProductsToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";
import type { SchedulePhasePlan } from "../types/schedulePhasePlan";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { isOnCanceledReplacedSubscription } from "../utils/isOnCanceledReplacedSubscription";
import { isOnUncollectedReplacedSubscription } from "../utils/isOnUncollectedReplacedSubscription";
import { nowReplacedCustomerProducts } from "../utils/nowReplacedCustomerProducts";
import { backdateGapLineItems } from "./backdateGapLineItems";
import {
	diffToCustomerProducts,
	type SetPlansCustomerProductChanges,
} from "./diffToCustomerProducts/diffToCustomerProducts";
import { diffToSchedule } from "./diffToSchedule";
import { keptCustomerProductsOnNewAnchor } from "./keptCustomerProductsOnNewAnchor";
import { keptReplacementEntitlementUpdates } from "./keptReplacementEntitlementUpdates";
import { paidBackdateAnchorMoveLineItems } from "./paidBackdateAnchorMoveLineItems";

export type ImmediatePhaseTransition = {
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
	keptCustomerProducts: FullCusProduct[];
	replacedCustomerProducts: FullCusProduct[];
};

export type SetPlansPlanResult = {
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
	immediatePhaseTransition: ImmediatePhaseTransition;
	customerProductChanges: SetPlansCustomerProductChanges;
};

export const computeSetPlansPlan = ({
	ctx,
	billingContext,
	timeline,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
}): SetPlansPlanResult => {
	const customerProductChanges = diffToCustomerProducts({
		ctx,
		billingContext,
		diff: timeline.diff,
	});
	const {
		outgoingCustomerProducts,
		keptCustomerProducts,
		immediateInsertCustomerProducts: immediateCustomerProducts,
	} = customerProductChanges;

	const customerLicenseTransitions = computeCustomerLicenseTransitions({
		outgoingCustomerProducts,
		incomingCustomerProducts: immediateCustomerProducts,
		customerLicenseBillingContext: billingContext.customerLicenseBillingContext,
		carryCustomerLicenseState: true,
	});
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts: immediateCustomerProducts,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
		customerLicenseTransitions,
		now: billingContext.currentEpochMs,
	});

	const allInsertCustomerProducts = [
		...immediateCustomerProducts,
		...customerProductChanges.scheduledInsertCustomerProducts,
	];

	const insertPlanLicenses = [
		...billingContext.productContexts,
		...billingContext.scheduledPhaseContexts.flatMap(
			(phase) => phase.productContexts,
		),
	].flatMap((productContext) => productContext.insertPlanLicenses ?? []);

	const creditedCustomerProducts = outgoingCustomerProducts.filter(
		(customerProduct) =>
			!isOnUncollectedReplacedSubscription({ billingContext, customerProduct }),
	);
	const replacedCustomerProducts = nowReplacedCustomerProducts({
		diff: timeline.diff,
		outgoingCustomerProducts,
		incomingCustomerProducts: immediateCustomerProducts,
	});
	// Finalize drops the stub charges for rows billed by the replacement under none, as Stripe's create bills nothing before its anchor.
	const {
		billedByReplacement: keptBilledByReplacement,
		reanchoredByPaidBackdate: keptReanchoredByPaidBackdate,
	} = keptCustomerProductsOnNewAnchor({ billingContext, keptCustomerProducts });
	const keptOnNewAnchor = [
		...keptBilledByReplacement,
		...keptReanchoredByPaidBackdate,
	];
	const { allLineItems, updateCustomerEntitlements } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: [
			...immediateCustomerProducts,
			...keptBilledByReplacement,
		],
		deletedCustomerProducts: creditedCustomerProducts,
		billingContext,
		includeArrearLineItems: creditedCustomerProducts.length > 0,
		carriesUsage: carriesUsageFrom({
			carryOverUsages: billingContext.carryOverUsages,
			sourceCustomerProducts: replacedCustomerProducts,
		}),
		creditsUnusedTime: (customerProduct) =>
			!isCustomerProductTrialing(customerProduct, {
				nowMs: billingContext.currentEpochMs,
			}) &&
			!isUnbilledByStripe({
				customerProduct,
				now: billingContext.currentEpochMs,
			}) &&
			!isOnCanceledReplacedSubscription({ billingContext, customerProduct }),
	});

	const { trialStartedCustomerProducts } = customerProductChanges;
	const { allLineItems: trialStartLineItems } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: trialStartedCustomerProducts.map(
			({ trialingCustomerProduct }) => trialingCustomerProduct,
		),
		deletedCustomerProducts: trialStartedCustomerProducts.map(
			({ customerProduct }) => customerProduct,
		),
		billingContext,
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

	const phases = diffToSchedule({
		diff: timeline.diff,
		requestedPhases: [
			{
				startsAt: billingContext.immediatePhase.starts_at,
				prorationBehavior: null,
			},
			...billingContext.scheduledPhaseContexts.map(
				({ startsAt, prorationBehavior }) => ({
					startsAt,
					prorationBehavior: prorationBehavior ?? null,
				}),
			),
		],
		customerProductIdBySegmentId:
			customerProductChanges.customerProductIdBySegmentId,
	});

	const baseAutumnBillingPlan: AutumnBillingPlan = {
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		ownsSchedulePersistence: true,
		schedulePhases: phases,
		insertCustomerProducts: allInsertCustomerProducts,
		updateCustomerProducts: customerProductChanges.updateCustomerProducts,
		patchCustomerProducts: customerProductChanges.patchCustomerProducts.length
			? customerProductChanges.patchCustomerProducts
			: undefined,
		deleteCustomerProducts: customerProductChanges.deleteCustomerProducts,
		customPrices: billingContext.customPrices,
		customEntitlements: [
			...(billingContext.customEnts ?? []),
			...oneOffPrepaidCarryOvers.entitlements,
		],
		customFreeTrial: billingContext.trialContext?.customFreeTrial,
		insertPlanLicenses: insertPlanLicenses.length
			? insertPlanLicenses
			: undefined,
		customerLicenseTransitions,
		lineItems: [
			...allLineItems,
			...trialStartLineItems,
			...backdateGapLineItems({ ctx, billingContext, customerProductChanges }),
			...paidBackdateAnchorMoveLineItems({
				ctx,
				billingContext,
				keptCustomerProducts: keptReanchoredByPaidBackdate,
			}),
		],
		updateCustomerEntitlements: [
			...updateCustomerEntitlements,
			...keptReplacementEntitlementUpdates({
				billingContext,
				keptCustomerProducts: keptOnNewAnchor,
				carriesUsage: carriesUsageFrom({
					carryOverUsages: billingContext.carryOverUsages,
					sourceCustomerProducts: keptOnNewAnchor,
				}),
			}),
		],
		insertCustomerEntitlements: oneOffPrepaidCarryOvers.customerEntitlements,
		pooledBalancePlan,
		lockCustomerCurrency,
	};
	const autumnBillingPlan = applyBillingCycleAnchorToSharedSubscription({
		ctx,
		plan: baseAutumnBillingPlan,
		billingContext,
		rebillsUnchangedPlansAtReset: true,
	});

	autumnBillingPlan.lineItems = finalizeLineItems({
		ctx,
		lineItems: autumnBillingPlan.lineItems ?? [],
		billingContext,
		autumnBillingPlan,
		resetsLikeStripeUnderNone: true,
	});

	return {
		autumnBillingPlan,
		phases,
		immediatePhaseTransition: {
			outgoingCustomerProducts,
			incomingCustomerProducts: immediateCustomerProducts,
			keptCustomerProducts,
			replacedCustomerProducts,
		},
		customerProductChanges,
	};
};
