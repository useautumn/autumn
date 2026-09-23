import {
	CusProductStatus,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
	type SyncPhase,
} from "@autumn/shared";
import type Stripe from "stripe";

/** Autumn's scheduled start is anchored, Stripe's phase start is not, so the
 * two drift by minutes on the same phase. */
const MAX_PHASE_START_DRIFT_MS = 24 * 60 * 60 * 1000;

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

/**
 * The entity every existing copy of this plan agrees on for this phase, or
 * undefined when they disagree — a customer-level copy must never be dragged
 * onto the entity of a differently scoped copy of the same plan.
 */
const findAgreedEntityId = ({
	customerProducts,
	planId,
	startsAt,
}: {
	customerProducts: FullCusProduct[];
	planId: string;
	startsAt: SyncPhase["starts_at"];
}): string | undefined => {
	const [first, ...rest] = findCopiesOnPhase({
		customerProducts: customerProducts.filter(
			(customerProduct) => customerProduct.product?.id === planId,
		),
		startsAt,
	});

	if (!first?.internal_entity_id) return undefined;
	return rest.every(
		(customerProduct) =>
			customerProduct.internal_entity_id === first.internal_entity_id,
	)
		? first.internal_entity_id
		: undefined;
};

/**
 * Detection is scope-blind: it matches Stripe prices to catalog products with
 * no knowledge of the customer's existing customer products. When a product is
 * already linked to this Stripe subscription via an entity-scoped customer
 * product, re-syncing it without that binding would insert a duplicate at the
 * customer level (and `expire_previous` would miss the entity-scoped original).
 *
 * Stamp the existing entity binding onto each matched plan so the sync
 * re-attaches the product on the same entity and matches/expires the original.
 */
export const stampEntityFromExistingLinks = ({
	phases,
	subscription,
	customerProducts,
}: {
	phases: SyncPhase[];
	subscription?: Stripe.Subscription;
	customerProducts: FullCusProduct[];
}): SyncPhase[] => {
	if (!subscription) return phases;

	const linkedCustomerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts,
		stripeSubscriptionId: subscription.id,
	});
	if (linkedCustomerProducts.length === 0) return phases;

	return phases.map((phase) => ({
		...phase,
		plans: phase.plans.map((plan) => {
			if (plan.entity_id != null) return plan;
			// `entity_id` accepts either the public or internal entity id, so the
			// internal id stored on the customer product is sufficient.
			const entityId = findAgreedEntityId({
				customerProducts: linkedCustomerProducts,
				planId: plan.plan_id,
				startsAt: phase.starts_at,
			});
			return entityId ? { ...plan, entity_id: entityId } : plan;
		}),
	}));
};
