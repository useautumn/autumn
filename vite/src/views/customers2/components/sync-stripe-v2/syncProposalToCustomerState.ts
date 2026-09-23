import type {
	Entity,
	Feature,
	FeatureQuantityParamsV0,
	FullCusProduct,
	ProductV2,
	SyncPhase,
	SyncPlanInstance,
	SyncProposalV2,
} from "@autumn/shared";
import {
	CusProductStatus,
	filterCustomerProductsByStripeSubscriptionId,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import { customerProductToCustomerStatePlan } from "@/components/forms/customer-state/customerProductToCustomerStatePlan";
import {
	type CustomerStateForm,
	type CustomerStatePhase,
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { applyCustomizeToProduct } from "./applyCustomizeToProduct";

type ProposalPhase = SyncProposalV2["phases"][number];

/** Autumn's scheduled start is anchored, Stripe's phase start is not, so the
 * two drift by minutes on the same phase. */
const MAX_PHASE_START_DRIFT_MS = 24 * 60 * 60 * 1000;

/**
 * Customer products store their entity by internal id — resolve it to the id
 * the scope picker uses. Null is customer-level.
 */
const resolveEntityId = ({
	entityId,
	entities,
}: {
	entityId: string | null | undefined;
	entities: Entity[];
}): string | null => {
	if (!entityId) return null;
	const entity = entities.find(
		(candidate) =>
			candidate.id === entityId || candidate.internal_id === entityId,
	);
	return entity ? entity.id || entity.internal_id : null;
};

const findLinkedCustomerProducts = ({
	proposal,
	customerProducts,
}: {
	proposal: SyncProposalV2;
	customerProducts: FullCusProduct[];
}): FullCusProduct[] => {
	const { stripe_subscription_id, stripe_schedule_id } = proposal;
	if (stripe_subscription_id)
		return filterCustomerProductsByStripeSubscriptionId({
			customerProducts,
			stripeSubscriptionId: stripe_subscription_id,
		});

	return customerProducts.filter((customerProduct) =>
		isCustomerProductOnStripeSubscriptionSchedule({
			customerProduct,
			stripeSubscriptionScheduleId: stripe_schedule_id,
		}),
	);
};

const findCopiesOnPhase = ({
	customerProducts,
	startsAt,
}: {
	customerProducts: FullCusProduct[];
	startsAt: SyncPhase["starts_at"];
}): FullCusProduct[] => {
	if (startsAt === "now")
		return customerProducts.filter(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);

	const scheduled = customerProducts.filter(
		(customerProduct) => customerProduct.status === CusProductStatus.Scheduled,
	);
	const nearestStart = scheduled
		.map((customerProduct) => customerProduct.starts_at)
		.filter((start) => Math.abs(start - startsAt) <= MAX_PHASE_START_DRIFT_MS)
		.sort((a, b) => Math.abs(a - startsAt) - Math.abs(b - startsAt))[0];

	return nearestStart === undefined
		? []
		: scheduled.filter(
				(customerProduct) => customerProduct.starts_at === nearestStart,
			);
};

/** A saved plan, as the customer holds it today. */
const savedPlanToCustomerStatePlan = ({
	customerProduct,
	entities,
	products,
}: {
	customerProduct: FullCusProduct;
	entities: Entity[];
	products: ProductV2[];
}): CustomerStatePlan => {
	return {
		...customerProductToCustomerStatePlan({
			cusProduct: customerProduct,
			products,
		}),
		entityId: resolveEntityId({
			entityId: customerProduct.entity_id ?? customerProduct.internal_entity_id,
			entities,
		}),
		quantity: customerProduct.quantity,
	};
};

const featureQuantitiesToPrepaidOptions = ({
	featureQuantities = [],
}: {
	featureQuantities?: FeatureQuantityParamsV0[];
}): Record<string, number> =>
	Object.fromEntries(
		featureQuantities.flatMap(({ feature_id, quantity }) =>
			quantity === undefined ? [] : [[feature_id, quantity]],
		),
	);

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
		prepaidOptions: featureQuantitiesToPrepaidOptions({
			featureQuantities: plan.feature_quantities,
		}),
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
		licenseQuantities: plan.license_quantities,
	};
};

const toCustomerStatePhase = ({
	phase,
	plans,
}: {
	phase: ProposalPhase;
	plans: CustomerStatePlan[];
}): CustomerStatePhase => ({
	startsAt: phase.starts_at === "now" ? null : phase.starts_at,
	plans,
});

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
		enablePlanImmediately: false,
	};
	const linkedCustomerProducts = findLinkedCustomerProducts({
		proposal,
		customerProducts,
	});

	if (linkedCustomerProducts.length === 0) {
		return {
			...options,
			phases: proposal.phases.map((phase) =>
				toCustomerStatePhase({
					phase,
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

	// With several phases, a live plan that never ends runs across all of them.
	const canUnschedule =
		proposal.phases.length > 1 && Boolean(proposal.stripe_subscription_id);
	const isOpenEnded = (customerProduct: FullCusProduct) =>
		canUnschedule &&
		customerProduct.status === CusProductStatus.Active &&
		!customerProduct.ended_at;

	const toPlans = ({
		phase,
		customerProducts: phaseCustomerProducts,
	}: {
		phase: ProposalPhase;
		customerProducts: FullCusProduct[];
	}) =>
		phaseCustomerProducts.map((customerProduct) =>
			savedPlanToCustomerStatePlan({
				customerProduct,
				entities,
				products,
			}),
		);

	const firstPhase = proposal.phases[0];
	return {
		...options,
		phases: proposal.phases.map((phase) =>
			toCustomerStatePhase({
				phase,
				plans: toPlans({
					phase,
					customerProducts: findCopiesOnPhase({
						customerProducts: linkedCustomerProducts,
						startsAt: phase.starts_at,
					}).filter((customerProduct) => !isOpenEnded(customerProduct)),
				}),
			}),
		),
		unscheduledPlans: firstPhase
			? toPlans({
					phase: firstPhase,
					customerProducts: linkedCustomerProducts.filter(isOpenEnded),
				})
			: [],
	};
};
