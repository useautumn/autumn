import type { CustomizePlanV1, Price } from "@autumn/shared";
import {
	isBasePriceMatch,
	isCustomBaseMatch,
} from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/classifyItemMatch";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";
import type { ItemDiff, PlanBase, PlanWarning } from "../types";
import { stripeItemToCustomBasePrice } from "./stripeItemToCustomBasePrice";

export type PlanBaseDecision = {
	base: PlanBase;
	customize?: CustomizePlanV1;
	/** The winning Stripe item — drives the plan's instance quantity. */
	baseStripeItem: StripeItemSnapshot | null;
	/** Base-ish items that lost the election — unexplained under this plan. */
	extraDiffs: ItemDiff[];
	warnings: PlanWarning[];
};

/**
 * Elect the plan's base item. Priority: identity hit on the plan's base
 * price > first convertible base-shaped item > none (dropped/absent).
 * Losing candidates become extras.
 */
export const decidePlanBase = ({
	diffs,
	basePrice,
}: {
	diffs: ItemDiff[];
	basePrice: Price | null;
}): PlanBaseDecision => {
	const baseHits = diffs.flatMap((diff) =>
		isBasePriceMatch(diff.match) ? [{ diff, price: diff.match.price }] : [],
	);
	const customBaseCandidates = diffs.filter((diff) =>
		isCustomBaseMatch(diff.match),
	);

	if (baseHits.length > 0) {
		const [winner, ...duplicates] = baseHits;
		return {
			base: {
				kind: "matched",
				stripe_item_id: winner.diff.stripe.id,
				autumn_price_id: winner.price.id,
			},
			baseStripeItem: winner.diff.stripe,
			extraDiffs: [
				...duplicates.map((duplicate) => duplicate.diff),
				...customBaseCandidates,
			],
			warnings: [],
		};
	}

	const [firstCandidate, ...losingCandidates] = customBaseCandidates;
	const customBasePrice = firstCandidate
		? stripeItemToCustomBasePrice({ item: firstCandidate.stripe })
		: null;
	if (firstCandidate && customBasePrice) {
		return {
			base: { kind: "custom", stripe_item_id: firstCandidate.stripe.id },
			customize: { price: customBasePrice },
			baseStripeItem: firstCandidate.stripe,
			extraDiffs: losingCandidates,
			warnings: [],
		};
	}

	// No electable base (an unconvertible candidate stays unexplained).
	return {
		...missingBaseVerdict({ basePrice }),
		baseStripeItem: null,
		extraDiffs: customBaseCandidates,
	};
};

/** No base item on the sub: a plan that should have one had it dropped;
 * a plan without one (e.g. free) simply has it absent. */
const missingBaseVerdict = ({
	basePrice,
}: {
	basePrice: Price | null;
}): Pick<PlanBaseDecision, "base" | "customize" | "warnings"> =>
	basePrice
		? {
				base: { kind: "dropped" },
				customize: { price: null },
				warnings: [{ type: "base_price_dropped" }],
			}
		: { base: { kind: "absent" }, warnings: [] };
