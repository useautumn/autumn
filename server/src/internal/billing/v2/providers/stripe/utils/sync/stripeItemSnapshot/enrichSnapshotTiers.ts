import type Stripe from "stripe";
import type { PhaseSnapshot } from "./types";

/**
 * Webhook payloads omit `price.tiers` (Stripe only includes tiers on
 * expand), so tiered items can't shape-match. Fetch the missing tier data
 * for tiered snapshots in place.
 */
export const enrichSnapshotTiers = async ({
	stripeCli,
	phaseSnapshots,
}: {
	stripeCli: Stripe;
	phaseSnapshots: PhaseSnapshot[];
}): Promise<void> => {
	const missingTierPriceIds = new Set<string>();
	for (const snapshot of phaseSnapshots) {
		for (const item of snapshot.items) {
			if (item.billing_scheme === "tiered" && !item.tiers?.length) {
				missingTierPriceIds.add(item.stripe_price_id);
			}
		}
	}
	if (missingTierPriceIds.size === 0) return;

	const prices = await Promise.all(
		[...missingTierPriceIds].map((priceId) =>
			stripeCli.prices.retrieve(priceId, { expand: ["tiers"] }),
		),
	);
	const priceById = new Map(prices.map((price) => [price.id, price]));

	for (const snapshot of phaseSnapshots) {
		for (const item of snapshot.items) {
			if (item.billing_scheme !== "tiered" || item.tiers?.length) continue;
			const price = priceById.get(item.stripe_price_id);
			if (!price?.tiers) continue;
			item.tiers = price.tiers.map((tier) => ({
				up_to: tier.up_to ?? null,
				unit_amount: tier.unit_amount ?? null,
				flat_amount: tier.flat_amount ?? null,
			}));
			item.tiers_mode =
				(price.tiers_mode as "graduated" | "volume" | null) ?? item.tiers_mode;
		}
	}
};
