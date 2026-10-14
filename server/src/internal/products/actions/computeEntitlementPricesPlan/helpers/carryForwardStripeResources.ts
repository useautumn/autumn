import {
	copyStripeResourcesToMatchingPrice,
	type Entitlement,
	type Price,
	type StripePriceMappingSlot,
} from "@autumn/shared";
import type { EntitlementPricesPlan } from "../types/entitlementPricesPlan";
import type { StripeMappingUnlinks } from "./stripeMappingUnlinks";

export const carryForwardStripeResources = ({
	plan,
	candidatePrices,
	candidateEntitlements,
	unlinks,
}: {
	plan: EntitlementPricesPlan;
	candidatePrices: Price[];
	candidateEntitlements: Entitlement[];
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

		const config = targetPrice.config as Partial<
			Record<StripePriceMappingSlot, string | null>
		>;
		for (const slot of unlinks?.get(targetPrice.id) ?? []) {
			config[slot] = null;
		}
	}
};
