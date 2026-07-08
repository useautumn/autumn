import { type FullProduct, isFixedPrice } from "@autumn/shared";
import type Stripe from "stripe";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { normalizeSubscriptionPhases } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/normalizeSubscriptionPhases";
import {
	collectStripeProductIdPriceCandidates,
	findAutumnMatchForStripeItem,
} from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/findAutumnMatchForStripeItem";
import { ProductService } from "@/internal/products/ProductService";
import { rollupMatchedPlans } from "./rollupMatchedPlans";
import type { ItemDiff, PhaseMatch, SubscriptionMatch } from "./types";

const baseAnchoredProductInternalIds = ({
	itemDiffs,
}: {
	itemDiffs: ItemDiff[];
}): Set<string> => {
	const internalIds = new Set<string>();
	for (const diff of itemDiffs) {
		if (diff.match.kind !== "autumn_price") continue;
		const { matched_on, price, product } = diff.match;
		const anchorsBase =
			matched_on.type === "stripe_base_price_shape" ||
			(matched_on.type === "stripe_price_id" && isFixedPrice(price));
		if (anchorsBase) {
			internalIds.add(product.internal_id);
		}
	}
	return internalIds;
};

/**
 * A `stripe_product_id` match is ambiguous when sibling plans share the Stripe
 * product; re-home it onto the plan whose base item already matched so it
 * doesn't spawn a phantom same-group plan.
 */
const preferBaseAnchoredProductForProductIdMatches = ({
	itemDiffs,
	fullProducts,
}: {
	itemDiffs: ItemDiff[];
	fullProducts: FullProduct[];
}): ItemDiff[] => {
	const anchoredInternalIds = baseAnchoredProductInternalIds({ itemDiffs });
	if (anchoredInternalIds.size === 0) return itemDiffs;

	return itemDiffs.map((diff) => {
		if (diff.match.kind !== "autumn_price") return diff;
		if (diff.match.matched_on.type !== "stripe_product_id") return diff;
		if (anchoredInternalIds.has(diff.match.product.internal_id)) return diff;

		const candidates = collectStripeProductIdPriceCandidates({
			item: diff.stripe,
			fullProducts,
		});
		const anchored = candidates.filter((candidate) =>
			anchoredInternalIds.has(candidate.product.internal_id),
		);
		if (anchored.length !== 1) return diff;

		const [chosen] = anchored;
		return {
			stripe: diff.stripe,
			match: {
				kind: "autumn_price" as const,
				matched_on: diff.match.matched_on,
				price: chosen.price,
				product: chosen.product,
			},
		};
	});
};

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
	fullProducts: preloadedFullProducts,
}: {
	ctx: AutumnContext;
	subscription?: Stripe.Subscription;
	schedule?: Stripe.SubscriptionSchedule;
	nowSec?: number;
	/** Optional pre-fetched catalog (callers matching many subscriptions pass
	 * this to avoid a per-call fetch). */
	fullProducts?: FullProduct[];
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

	const fullProducts =
		preloadedFullProducts ??
		(await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		}));

	const phaseMatches: PhaseMatch[] = phaseSnapshots.map((snapshot) => {
		const itemDiffs = preferBaseAnchoredProductForProductIdMatches({
			itemDiffs: snapshot.items.map((item) =>
				findAutumnMatchForStripeItem({ item, fullProducts }),
			),
			fullProducts,
		});
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
