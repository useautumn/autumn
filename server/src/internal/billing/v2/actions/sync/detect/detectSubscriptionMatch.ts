import type Stripe from "stripe";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { normalizeSubscriptionPhases } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/normalizeSubscriptionPhases";
import { findAutumnMatchForStripeItem } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/findAutumnMatchForStripeItem";
import { ProductService } from "@/internal/products/ProductService";
import { rollupMatchedPlans } from "./rollupMatchedPlans";
import type { PhaseMatch, SubscriptionMatch } from "./types";

/**
 * Detect how a Stripe subscription and/or schedule maps to Autumn plans.
 *
 *   - subscription only    → single open-ended phase from sub.items
 *   - schedule only        → one phase per schedule.phases (e.g. future-
 *                            dated schedule with no subscription yet)
 *   - subscription + schedule → schedule phases (subscription provides id)
 *
 * Pipeline: normalize → per-item match → rollup.
 */
export const detectSubscriptionMatch = async ({
	ctx,
	subscription,
	schedule,
	nowSec,
}: {
	ctx: AutumnContext;
	subscription?: Stripe.Subscription;
	schedule?: Stripe.SubscriptionSchedule;
	nowSec?: number;
}): Promise<SubscriptionMatch> => {
	if (!subscription && !schedule) {
		throw new Error(
			"detectSubscriptionMatch requires a subscription or a schedule",
		);
	}

	const phaseSnapshots = normalizeSubscriptionPhases({
		subscription,
		schedule,
		nowSec,
	});

	const fullProducts = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const phaseMatches: PhaseMatch[] = phaseSnapshots.map((snapshot) => {
		const itemDiffs = snapshot.items.map((item) =>
			findAutumnMatchForStripeItem({ item, fullProducts }),
		);
		const plans = rollupMatchedPlans({ itemDiffs });
		return {
			start_date: snapshot.start_date,
			end_date: snapshot.end_date,
			is_current: snapshot.is_current,
			item_diffs: itemDiffs,
			plans,
		};
	});

	const stripeScheduleId =
		schedule?.id ??
		stripeSubscriptionToScheduleId({ stripeSubscription: subscription }) ??
		null;

	return {
		stripe_subscription_id: subscription?.id ?? null,
		stripe_schedule_id: stripeScheduleId,
		phaseMatches,
	};
};
