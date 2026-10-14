import { isPrepaidPrice } from "@autumn/shared";
import { isFeaturePriceMatch } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/classifyItemMatch";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";
import type { ItemDiff } from "../types";

export const derivePlanQuantity = ({
	baseStripeItem,
	diffs,
}: {
	baseStripeItem: StripeItemSnapshot | null;
	diffs: ItemDiff[];
}): number => {
	if (baseStripeItem) return baseStripeItem.quantity;
	const quantityFeature = diffs.find(
		(diff) =>
			isFeaturePriceMatch(diff.match) && !isPrepaidPrice(diff.match.price),
	);
	return quantityFeature?.stripe.quantity ?? 1;
};
