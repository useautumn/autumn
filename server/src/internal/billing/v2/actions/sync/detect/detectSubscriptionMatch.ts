import type { FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { normalizeSubscriptionPhases } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/normalizeSubscriptionPhases";
import { findAutumnMatchForStripeItem } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/findAutumnMatchForStripeItem";
import { ProductService } from "@/internal/products/ProductService";
import { itemDiffsToMatchedPlans } from "./itemDiffsToMatchedPlans/itemDiffsToMatchedPlans";
import { rematchFeaturesWithinAnchoredPlans } from "./rematchFeaturesWithinAnchoredPlans";
import type { PhaseMatch, SubscriptionMatch } from "./types";

export const detectSubscriptionMatch = async ({
	ctx,
	subscription,
	schedule,
	billingCurrency,
	nowSec,
	fullProducts: preloadedFullProducts,
	linkedInternalProductIds,
}: {
	ctx: AutumnContext;
	subscription?: Stripe.Subscription;
	schedule?: Stripe.SubscriptionSchedule;
	billingCurrency?: string | null;
	nowSec?: number;
	fullProducts?: FullProduct[];
	linkedInternalProductIds?: ReadonlySet<string>;
}): Promise<SubscriptionMatch> => {
	if (!subscription && !schedule) {
		throw new Error(
			"detectSubscriptionMatch requires a subscription or a schedule",
		);
	}

	const phaseSnapshots = normalizeSubscriptionPhases({
		subscription,
		schedule,
		billingCurrency,
		nowSec,
	});

	const fullProducts =
		preloadedFullProducts ??
		(await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		}));

	const phaseMatches: PhaseMatch[] = phaseSnapshots.map((snapshot) => {
		const itemDiffs = rematchFeaturesWithinAnchoredPlans({
			itemDiffs: snapshot.items.map((item) =>
				findAutumnMatchForStripeItem({
					item,
					fullProducts,
					org: ctx.org,
					linkedInternalProductIds: snapshot.is_current
						? linkedInternalProductIds
						: undefined,
				}),
			),
			org: ctx.org,
		});
		const plans = itemDiffsToMatchedPlans({ itemDiffs });
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
