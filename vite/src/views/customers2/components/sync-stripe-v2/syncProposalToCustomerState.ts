import type {
	Entity,
	Feature,
	FullCusProduct,
	ProductV2,
	SyncPlanInstance,
	SyncProposalV2,
} from "@autumn/shared";
import { isCustomerProductUnlinkedFree } from "@autumn/shared";
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
import { scopeCustomerProducts } from "@/components/forms/customer-state/scopeCustomerProducts";
import { DISABLED_FREE_TRIAL_FORM_VALUES } from "@/components/forms/shared/utils/freeTrialFormValues";
import { quantityRecordFrom } from "@/components/forms/shared/utils/requestBodyOverrideHelpers";
import { applyCustomizeToProduct } from "./applyCustomizeToProduct";

/** A matched main plan replaces a free main plan in its group on the same scope. */
const isDisplacedByMatchedPlan = ({
	freePlan,
	matchedPlans,
	products,
}: {
	freePlan: CustomerStatePlan;
	matchedPlans: CustomerStatePlan[];
	products: ProductV2[];
}) => {
	const freeProduct = products.find(({ id }) => id === freePlan.productId);
	if (!freeProduct || freeProduct.is_add_on) return false;
	return matchedPlans.some((matchedPlan) => {
		const matchedProduct = products.find(
			({ id }) => id === matchedPlan.productId,
		);
		return (
			matchedProduct !== undefined &&
			!matchedProduct.is_add_on &&
			matchedProduct.group === freeProduct.group &&
			matchedPlan.entityId === freePlan.entityId
		);
	});
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
 * Autumn already holds for it plus the free plans, cut into Stripe's phases;
 * with nothing linked yet (a first import), the matcher's plans stand in.
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
		resetBillingCycle: false,
		billingCycleAnchorMode: "now",
		billingCycleAnchorDate: null,
		endDate: null,
		enablePlanImmediately: false,
		...DISABLED_FREE_TRIAL_FORM_VALUES,
		trialEdited: false,
	} as const;
	const scopedCustomerProducts = scopeCustomerProducts({
		customerProducts,
		stripeSubscriptionId: proposal.stripe_subscription_id,
		stripeScheduleId: proposal.stripe_schedule_id,
	});
	const phaseStarts = proposal.phases.map((phase) => phase.starts_at);
	const isFirstImport = scopedCustomerProducts.every(
		isCustomerProductUnlinkedFree,
	);

	if (isFirstImport) {
		const freeState = customerProductsToCustomerState({
			customerProducts: scopedCustomerProducts,
			phaseStarts,
			canUnschedule: false,
			entities,
			products,
		});
		return {
			...options,
			phases: proposal.phases.map((phase, phaseIndex) => {
				const matchedPlans = phase.plans.map((plan) =>
					matchedPlanToCustomerStatePlan({
						plan,
						entities,
						contextEntityId,
						products,
						features,
					}),
				);
				const freePlans = (freeState.phases[phaseIndex]?.plans ?? []).filter(
					(freePlan) =>
						!isDisplacedByMatchedPlan({ freePlan, matchedPlans, products }),
				);
				return toCustomerStatePhase({
					startsAt: phase.starts_at,
					plans: [...matchedPlans, ...freePlans],
				});
			}),
			unscheduledPlans: [],
		};
	}

	return {
		...options,
		...customerProductsToCustomerState({
			customerProducts: scopedCustomerProducts,
			phaseStarts,
			canUnschedule:
				proposal.phases.length > 1 && Boolean(proposal.stripe_subscription_id),
			entities,
			products,
		}),
	};
};
