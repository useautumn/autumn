import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	type FullCusProduct,
	isFreeProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyBillingCycleAnchorToSharedSubscription } from "@/internal/billing/v2/compute/computeAutumnUtils/applyBillingCycleAnchorToSharedSubscription";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { cusProductsToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";
import type { SchedulePhasePlan } from "../types/schedulePhasePlan";
import { isOnUncollectedReplacedSubscription } from "../utils/isOnUncollectedReplacedSubscription";
import { resolveSetPlansRecurringProducts } from "../utils/resolveSetPlansRecurringProducts";
import { computeImmediatePhaseCustomerProducts } from "./computeImmediatePhaseCustomerProducts";
import { computeScheduledCustomerProducts } from "./computeScheduledCustomerProducts";
import { endRetainedSubscriptionCustomerProducts } from "./endRetainedSubscriptionCustomerProducts";

/** The immediate phase's plan change, which the guards validate with attach's
 * immediate-timing rules. Future phases are validated at activation. */
export type ImmediatePhaseTransition = {
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
};

export type SetPlansPlanResult = {
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
	immediatePhaseTransition: ImmediatePhaseTransition;
};

/** Compute the full create_schedule billing plan (immediate + scheduled phases). */
export const computeSetPlansPlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
}): SetPlansPlanResult => {
	const nextPhaseStartsAt = billingContext.futurePhases[0]?.starts_at;
	const {
		recurringOutgoing: outgoingCustomerProducts,
		recurringEndingAtPhase,
		recurringScheduled: existingScheduledCustomerProducts,
	} = resolveSetPlansRecurringProducts({ billingContext });

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
	const immediateCustomerProducts = immediate.insertCustomerProducts;

	// The immediate phase expires the outgoing rows and inserts fresh ones, so
	// pools must re-parent now; future phases carry theirs at activation.
	const customerLicenseTransitions = computeCustomerLicenseTransitions({
		outgoingCustomerProducts,
		incomingCustomerProducts: immediateCustomerProducts,
		customerLicenseBillingContext: billingContext.customerLicenseBillingContext,
		carryCustomerLicenseState: true,
	});
	// After transitions: pools must key on the carried link, not a fresh one.
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
		...scheduled.insertCustomerProducts,
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
	const { allLineItems, updateCustomerEntitlements } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: immediateCustomerProducts,
		deletedCustomerProducts: creditedCustomerProducts,
		billingContext,
		includeArrearLineItems: creditedCustomerProducts.length > 0,
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

	const baseAutumnBillingPlan: AutumnBillingPlan = {
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		// Schedule persistence replaces phases wholesale, so nothing may rewrite them mid-flight.
		ownsSchedulePersistence: true,
		insertCustomerProducts: allInsertCustomerProducts,
		updateCustomerProducts: [
			...immediate.updateCustomerProducts,
			...recurringEndingAtPhase.map(({ customerProduct, endsAt }) => ({
				customerProduct,
				updates: { ended_at: endsAt },
			})),
			...endRetainedSubscriptionCustomerProducts({
				billingContext,
				handledCustomerProductIds: new Set(
					[
						...outgoingCustomerProducts,
						...recurringEndingAtPhase.map(
							({ customerProduct }) => customerProduct,
						),
					].map((customerProduct) => customerProduct.id),
				),
			}),
		],
		deleteCustomerProducts: scheduled.deleteCustomerProducts,
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
		lineItems: allLineItems,
		updateCustomerEntitlements,
		insertCustomerEntitlements: oneOffPrepaidCarryOvers.customerEntitlements,
		pooledBalancePlan,
		lockCustomerCurrency,
	};
	const autumnBillingPlan =
		typeof billingContext.requestedBillingCycleAnchor === "number"
			? applyBillingCycleAnchorToSharedSubscription({
					plan: baseAutumnBillingPlan,
					billingContext,
				})
			: baseAutumnBillingPlan;

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
		immediatePhaseTransition: {
			outgoingCustomerProducts,
			incomingCustomerProducts: immediateCustomerProducts,
		},
	};
};
