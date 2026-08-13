import {
	copyStripeResourcesToMatchingPrice,
	type Entitlement,
	type Price,
} from "@autumn/shared";
import type { EntitlementPricesPlan } from "../types/entitlementPricesPlan";

/** Mutates plan's new/updated prices in place, copying Stripe ids from matching current rows. */
export const carryForwardStripeResources = ({
	plan,
	candidatePrices,
	candidateEntitlements,
}: {
	plan: EntitlementPricesPlan;
	candidatePrices: Price[];
	candidateEntitlements: Entitlement[];
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
	}
};
