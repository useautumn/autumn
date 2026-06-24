import {
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
	type SyncParamsV1,
	type SyncPhase,
	type SyncPlanInstance,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeActiveSubscriptionSchedule } from "@/external/stripe/subscriptionSchedules";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { buildFeatureQuantities } from "./buildSyncParams/buildFeatureQuantities";
import { detectSubscriptionMatch } from "./detect/detectSubscriptionMatch";
import type {
	ItemDiff,
	MatchedPlan,
	PhaseMatch,
	SubscriptionMatch,
} from "./detect/types";

const matchedPlanToSyncPlan = ({
	matchedPlan,
	itemDiffs,
}: {
	matchedPlan: MatchedPlan;
	itemDiffs: ItemDiff[];
}): SyncPlanInstance => {
	const featureQuantities = buildFeatureQuantities({ matchedPlan, itemDiffs });
	return {
		plan_id: matchedPlan.product.id,
		quantity: matchedPlan.quantity,
		customize: matchedPlan.customize,
		expire_previous: true,
		feature_quantities:
			featureQuantities.length > 0 ? featureQuantities : undefined,
	};
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
const stampEntityFromExistingLinks = ({
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

	// product id → existing entity binding (only entity-scoped links).
	// `entity_id` accepts either the public or internal entity id, so the
	// internal id stored on the customer product is sufficient.
	const entityIdByProductId = new Map<string, string>();
	for (const customerProduct of linkedCustomerProducts) {
		const productId = customerProduct.product?.id;
		if (customerProduct.internal_entity_id && productId) {
			entityIdByProductId.set(productId, customerProduct.internal_entity_id);
		}
	}

	if (entityIdByProductId.size === 0) return phases;

	return phases.map((phase) => ({
		...phase,
		plans: phase.plans.map((plan) => {
			if (plan.entity_id != null) return plan;
			const entityId = entityIdByProductId.get(plan.plan_id);
			return entityId ? { ...plan, entity_id: entityId } : plan;
		}),
	}));
};

const phaseMatchToSyncPhase = ({
	phaseMatch,
}: {
	phaseMatch: PhaseMatch;
}): SyncPhase => ({
	// PhaseMatch.start_date is Stripe-native (seconds). SyncPhase.starts_at
	// is ms epoch (or the "now" sentinel for the immediate phase).
	starts_at: phaseMatch.is_current ? "now" : secondsToMs(phaseMatch.start_date),
	plans: phaseMatch.plans.map((matchedPlan) =>
		matchedPlanToSyncPlan({
			matchedPlan,
			itemDiffs: phaseMatch.item_diffs,
		}),
	),
});

/**
 * Run subscription detection and shape the result into a `SyncParamsV1`
 * draft. Returns BOTH the raw `SubscriptionMatch` (for eligibility checks
 * and proposal display extras) and the derived params.
 *
 * Single canonical path used by:
 *   - `syncProposalsV2` — surfaces `params` to the dashboard for editing
 *   - `autoSyncFromSubscription` — feeds `params` into `syncV2` when
 *     `canAutoSync` says yes.
 */
export const subscriptionToSyncParams = async ({
	ctx,
	customerId,
	subscription,
	schedule,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerId: string;
	subscription?: Stripe.Subscription;
	/** Optional pre-fetched schedule. When omitted and `subscription` references
	 * a schedule, it's fetched with schedule item prices expanded. */
	schedule?: Stripe.SubscriptionSchedule;
	/** Optional pre-fetched customer products (callers that already loaded the
	 * full customer pass these to avoid a redundant fetch). Used to restore the
	 * entity binding of products already linked to this subscription. */
	customerProducts?: FullCusProduct[];
}): Promise<{
	match: SubscriptionMatch;
	params: SyncParamsV1;
	schedule: Stripe.SubscriptionSchedule | null;
}> => {
	let resolvedSchedule = schedule;
	if (!resolvedSchedule) {
		const scheduleId = stripeSubscriptionToScheduleId({
			stripeSubscription: subscription,
		});
		if (scheduleId) {
			resolvedSchedule = await getStripeActiveSubscriptionSchedule({
				stripeClient: createStripeCli({ org: ctx.org, env: ctx.env }),
				subscriptionScheduleId: scheduleId,
				expand: ["phases.items.price.product"],
			});
		}
	}

	const match = await detectSubscriptionMatch({
		ctx,
		subscription,
		schedule: resolvedSchedule,
	});

	const detectedPhases: SyncPhase[] = match.phaseMatches
		.filter((phase) => phase.plans.length > 0)
		.map((phaseMatch) => phaseMatchToSyncPhase({ phaseMatch }));

	const resolvedCustomerProducts =
		customerProducts ??
		(subscription
			? (await CusService.getFull({ ctx, idOrInternalId: customerId }))
					.customer_products
			: []);

	const phases = stampEntityFromExistingLinks({
		phases: detectedPhases,
		subscription,
		customerProducts: resolvedCustomerProducts,
	});

	const params: SyncParamsV1 = {
		customer_id: customerId,
		stripe_subscription_id: subscription?.id,
		stripe_schedule_id: match.stripe_schedule_id ?? undefined,
		phases,
	};

	return { match, params, schedule: resolvedSchedule ?? null };
};
