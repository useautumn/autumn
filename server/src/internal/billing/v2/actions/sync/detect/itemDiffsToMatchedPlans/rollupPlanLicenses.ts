import { isLicenseSeatMatch } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/classifyItemMatch";
import type { ItemDiff, MatchedPlanLicense, PlanWarning } from "../types";
import { stripeItemToCustomBasePrice } from "./stripeItemToCustomBasePrice";

export type PlanLicensesRollup = {
	licenses: MatchedPlanLicense[];
	warnings: PlanWarning[];
};

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
