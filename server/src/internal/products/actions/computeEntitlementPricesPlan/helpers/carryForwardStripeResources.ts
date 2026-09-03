import {
	copyStripeResourcesToMatchingPrice,
	type Entitlement,
	type Price,
	type StripePriceMappingSlot,
} from "@autumn/shared";
import type { EntitlementPricesPlan } from "../types/entitlementPricesPlan";
import type { StripeMappingUnlinks } from "./stripeMappingUnlinks";

/** Mutates plan's new/updated prices in place, copying Stripe ids from matching current rows. */
export const carryForwardStripeResources = ({
	plan,
	candidatePrices,
	candidateEntitlements,
	unlinks,
}: {
	plan: EntitlementPricesPlan;
	candidatePrices: Price[];
	candidateEntitlements: Entitlement[];
	/** Stripe mapping slots the request stated as `null`, by price id. */
	unlinks?: StripeMappingUnlinks;
}) => {
	const targetPrices = [...plan.prices.new, ...plan.prices.updated];
	const targetEntitlements = [
		...plan.entitlements.new,
		...plan.entitlements.updated,
		...plan.entitlements.same,
	];

	for (const targetPrice of targetPrices) {
		copyStripeResourcesToMatchingPrice({
			targetPrice,
			candidatePrices,
			targetEntitlements,
			candidateEntitlements,
		});

		// The copy refills any nullish field from the row it matched — which for
		// an updated row is the row itself, still holding the id the request
		// asked to unlink. Re-clear the slots the plan deliberately emptied.
		const config = targetPrice.config as Partial<
			Record<StripePriceMappingSlot, string | null>
		>;
		for (const slot of unlinks?.get(targetPrice.id) ?? []) {
			config[slot] = null;
		}
	}
};
