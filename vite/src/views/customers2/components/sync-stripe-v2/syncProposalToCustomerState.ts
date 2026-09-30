import type {
	Entity,
	Feature,
	FullCusProduct,
	ProductV2,
	SyncPlanInstance,
	SyncProposalV2,
} from "@autumn/shared";
import {
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import {
	customerProductsToCustomerState,
	resolveEntityId,
	toCustomerStatePhase,
} from "@/components/forms/customer-state/customerProductsToCustomerState";
import {
	type CustomerStateForm,
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { quantityRecordFrom } from "@/components/forms/shared/utils/requestBodyOverrideHelpers";
import { applyCustomizeToProduct } from "./applyCustomizeToProduct";

/** Scheduled plans link through the Stripe schedule only, so a subscription's
 * plans are the ones on it or on its schedule. */
const findLinkedCustomerProducts = ({
	proposal,
	customerProducts,
}: {
	proposal: SyncProposalV2;
	customerProducts: FullCusProduct[];
}): FullCusProduct[] => {
	const { stripe_subscription_id, stripe_schedule_id } = proposal;
	return customerProducts.filter(
		(customerProduct) =>
			(stripe_subscription_id &&
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId: stripe_subscription_id,
				})) ||
			isCustomerProductOnStripeSubscriptionSchedule({
				customerProduct,
				stripeSubscriptionScheduleId: stripe_schedule_id,
			}),
	);
};

/** A plan the matcher guessed from Stripe's prices, for a subscription Autumn
 * has never linked a plan to. */
const matchedPlanToCustomerStatePlan = ({
	plan,
	entities,
	contextEntityId,
	products,
	features,
}: {
	plan: SyncPlanInstance;
	entities: Entity[];
	contextEntityId: string | null;
	products: ProductV2[];
	features: Feature[];
}): CustomerStatePlan => {
	const { customize } = plan;
	const product = products.find(({ id }) => id === plan.plan_id);
	const isCustom = customize?.price !== undefined || Boolean(customize?.items);

	return {
		...EMPTY_CUSTOMER_STATE_PLAN,
		productId: plan.plan_id,
		version: plan.version,
		prepaidOptions: quantityRecordFrom(plan.feature_quantities, "feature_id"),
		licenseQuantities: quantityRecordFrom(
			plan.license_quantities,
			"license_plan_id",
		),
		items:
			isCustom && product
				? applyCustomizeToProduct({ product, customize, features }).items
				: null,
		isCustom,
		addLicenses: customize?.upsert_licenses ?? null,
		entityId: resolveEntityId({
			entityId: plan.entity_id ?? contextEntityId,
			entities,
		}),
		quantity: plan.quantity,
	};
};

/**
 * The customer state a Stripe subscription implies. Rows come from the plans
 * Autumn already holds for it, cut into Stripe's phases; with nothing saved
 * yet (a first import), the matcher's plans are the only source.
 */
export const syncProposalToCustomerState = ({
	proposal,
	customerProducts,
	entities,
	contextEntityId,
	products,
	features,
}: {
	proposal: SyncProposalV2;
	customerProducts: FullCusProduct[];
	entities: Entity[];
	contextEntityId: string | null;
	products: ProductV2[];
	features: Feature[];
}): CustomerStateForm => {
	const options = {
		billingBehavior: null,
		resetBillingCycle: false,
		billingCycleAnchorMode: "now",
		billingCycleAnchorDate: null,
		endDate: null,
		enablePlanImmediately: false,
	} as const;
	const linkedCustomerProducts = findLinkedCustomerProducts({
		proposal,
		customerProducts,
	});

	if (linkedCustomerProducts.length === 0) {
		return {
			...options,
			phases: proposal.phases.map((phase) =>
				toCustomerStatePhase({
					startsAt: phase.starts_at,
					plans: phase.plans.map((plan) =>
						matchedPlanToCustomerStatePlan({
							plan,
							entities,
							contextEntityId,
							products,
							features,
						}),
					),
				}),
			),
			unscheduledPlans: [],
		};
	}

	return {
		...options,
		...customerProductsToCustomerState({
			customerProducts: linkedCustomerProducts,
			phaseStarts: proposal.phases.map((phase) => phase.starts_at),
			canUnschedule:
				proposal.phases.length > 1 && Boolean(proposal.stripe_subscription_id),
			entities,
			products,
		}),
	};
};
