import {
	secondsToMs,
	type SyncParamsV1,
	type SyncPhase,
	type SyncPlanInstance,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeActiveSubscriptionSchedule } from "@/external/stripe/subscriptionSchedules";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
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

const phaseMatchToSyncPhase = ({
	phaseMatch,
}: {
	phaseMatch: PhaseMatch;
}): SyncPhase => ({
	// PhaseMatch.start_date is Stripe-native (seconds). SyncPhase.starts_at
	// is ms epoch (or the "now" sentinel for the immediate phase).
	starts_at: phaseMatch.is_current
		? "now"
		: secondsToMs(phaseMatch.start_date),
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
}: {
	ctx: AutumnContext;
	customerId: string;
	subscription?: Stripe.Subscription;
	/** Optional pre-fetched schedule. When omitted and `subscription` references
	 * a schedule, it's fetched (with `phases.items.price` expanded — required
	 * by `normalizePhaseItem` to resolve `stripe_product_id`). */
	schedule?: Stripe.SubscriptionSchedule;
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
				expand: ["phases.items.price"],
			});
		}
	}

	const match = await detectSubscriptionMatch({
		ctx,
		subscription,
		schedule: resolvedSchedule,
	});

	const phases: SyncPhase[] = match.phaseMatches
		.filter((phase) => phase.plans.length > 0)
		.map((phaseMatch) => phaseMatchToSyncPhase({ phaseMatch }));

	const params: SyncParamsV1 = {
		customer_id: customerId,
		stripe_subscription_id: subscription?.id,
		stripe_schedule_id: match.stripe_schedule_id ?? undefined,
		phases,
	};

	return { match, params, schedule: resolvedSchedule ?? null };
};
