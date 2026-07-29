import { isLicenseSeatMatch } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/classifyItemMatch";
import type { ItemDiff, MatchedPlanLicense, PlanWarning } from "../types";
import { stripeItemToCustomBasePrice } from "./stripeItemToCustomBasePrice";

export type PlanLicensesRollup = {
	licenses: MatchedPlanLicense[];
	warnings: PlanWarning[];
};

/**
 * Fold seat items into per-license totals: link included + Stripe paid
 * quantity (summed across items on the same license plan). A non-catalog
 * price becomes a customize; one that can't express a base price warns.
 */
export const rollupPlanLicenses = ({
	diffs,
}: {
	diffs: ItemDiff[];
}): PlanLicensesRollup => {
	const byLicensePlanId = new Map<string, MatchedPlanLicense>();
	const unresolvableItemIds: string[] = [];

	for (const diff of diffs) {
		if (!isLicenseSeatMatch(diff.match)) continue;

		const licensePlanId = diff.match.product.id;
		const existing = byLicensePlanId.get(licensePlanId);
		if (existing) {
			existing.quantity += diff.stripe.quantity;
			continue;
		}

		// price === null means the item hit the license's Stripe product with a
		// price Autumn doesn't own — sync it as a custom license definition.
		const hasCatalogPrice = diff.match.price !== null;
		const customPrice = hasCatalogPrice
			? null
			: stripeItemToCustomBasePrice({ item: diff.stripe });
		if (!hasCatalogPrice && !customPrice) {
			unresolvableItemIds.push(diff.stripe.id);
			continue;
		}

		byLicensePlanId.set(licensePlanId, {
			license_plan_id: licensePlanId,
			quantity: diff.match.parent_plan_license.included + diff.stripe.quantity,
			stripe_item_id: diff.stripe.id,
			...(customPrice ? { customize: { price: customPrice } } : {}),
		});
	}

	return {
		licenses: [...byLicensePlanId.values()],
		warnings:
			unresolvableItemIds.length > 0
				? [
						{
							type: "license_price_unresolvable",
							stripe_item_ids: unresolvableItemIds,
						},
					]
				: [],
	};
};
