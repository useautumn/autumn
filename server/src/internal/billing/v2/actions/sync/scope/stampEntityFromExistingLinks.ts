import {
	ACTIVE_STATUSES,
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
		return customerProducts.filter((customerProduct) =>
			ACTIVE_STATUSES.includes(customerProduct.status),
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
			const entityId = findAgreedEntityId({
				customerProducts: linkedCustomerProducts,
				planId: plan.plan_id,
				startsAt: phase.starts_at,
			});
			return entityId ? { ...plan, entity_id: entityId } : plan;
		}),
	}));
};
