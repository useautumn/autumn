import {
	type Feature,
	type FixedPriceConfig,
	isFixedPrice,
	isPrepaidPrice,
	isUsagePrice,
	type Price,
	stripeToAtmnAmount,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";

const AMOUNT_EPSILON = 1e-9;
const amountsEqual = (a: number, b: number) => Math.abs(a - b) < AMOUNT_EPSILON;

const snapshotUnitAmount = ({
	snapshot,
}: {
	snapshot: StripeItemSnapshot;
}): number | null => {
	const raw = snapshot.unit_amount_decimal ?? snapshot.unit_amount;
	if (raw === null || !snapshot.currency) return null;
	const amount = Number(raw);
	if (!Number.isFinite(amount)) return null;
	return stripeToAtmnAmount({ amount, currency: snapshot.currency });
};

/** internal_feature_id → the feature's Stripe product, read off catalog usage
 * prices — the same link detection uses to match a line to a feature. */
const buildFeatureStripeProductIds = ({
	catalogPrices,
}: {
	catalogPrices: Price[];
}): Map<string, string> => {
	const byFeature = new Map<string, string>();
	for (const price of catalogPrices) {
		if (!isUsagePrice({ price })) continue;
		const config = price.config as UsagePriceConfig;
		if (config.internal_feature_id && config.stripe_product_id) {
			byFeature.set(config.internal_feature_id, config.stripe_product_id);
		}
	}
	return byFeature;
};

const usageTiersMatchSnapshot = ({
	config,
	snapshot,
}: {
	config: UsagePriceConfig;
	snapshot: StripeItemSnapshot;
}): boolean => {
	if (!snapshot.currency) return false;
	if (snapshot.tiers && snapshot.tiers.length > 0) {
		if (config.usage_tiers.length !== snapshot.tiers.length) return false;
		return config.usage_tiers.every((tier, index) => {
			const stripeTier = snapshot.tiers?.[index];
			if (!stripeTier) return false;
			const stripeAmount = stripeToAtmnAmount({
				amount: Number(
					stripeTier.unit_amount_decimal ?? stripeTier.unit_amount ?? 0,
				),
				currency: snapshot.currency as string,
			});
			return (
				amountsEqual(tier.amount, stripeAmount) &&
				tier.to === (stripeTier.up_to ?? "inf")
			);
		});
	}
	if (config.usage_tiers.length !== 1) return false;
	const amount = snapshotUnitAmount({ snapshot });
	return amount !== null && amountsEqual(config.usage_tiers[0].amount, amount);
};

/** A flat base price maps to a licensed line with the same amount. */
const licensedSnapshotForFixedPrice = ({
	config,
	snapshots,
	claimed,
}: {
	config: FixedPriceConfig;
	snapshots: StripeItemSnapshot[];
	claimed: Set<string>;
}): StripeItemSnapshot | undefined =>
	snapshots.find((snapshot) => {
		if (claimed.has(snapshot.id)) return false;
		if (snapshot.recurring_usage_type !== "licensed") return false;
		const amount = snapshotUnitAmount({ snapshot });
		return amount !== null && amountsEqual(config.amount, amount);
	});

/** A usage price maps to its feature's line: metered for pay-as-you-go,
 * licensed for prepaid. The feature is matched by its Stripe product (or meter
 * for pay-as-you-go), and the amount must still match so an edited price mints
 * a fresh Stripe price instead of reusing the wrong one. */
const snapshotForUsagePrice = ({
	price,
	config,
	snapshots,
	featureStripeProductIds,
	features,
	claimed,
}: {
	price: Price;
	config: UsagePriceConfig;
	snapshots: StripeItemSnapshot[];
	featureStripeProductIds: Map<string, string>;
	features: Feature[];
	claimed: Set<string>;
}): StripeItemSnapshot | undefined => {
	const prepaid = isPrepaidPrice(price);
	const wantsUsageType = prepaid ? "licensed" : "metered";

	const productId = featureStripeProductIds.get(config.internal_feature_id);
	const meterId = prepaid
		? undefined
		: features.find(
				(feature) => feature.internal_id === config.internal_feature_id,
			)?.stripe_meter?.id;

	return snapshots.find((snapshot) => {
		if (claimed.has(snapshot.id)) return false;
		if (snapshot.recurring_usage_type !== wantsUsageType) return false;
		const matchesFeature =
			(productId != null && snapshot.stripe_product_id === productId) ||
			(meterId != null && snapshot.stripe_meter_id === meterId);
		return matchesFeature && usageTiersMatchSnapshot({ config, snapshot });
	});
};

/** Find the Stripe line a custom price came from: base → licensed, usage →
 * metered/licensed for its feature. Everything else has no line to reuse. */
const findSnapshotForCustomPrice = ({
	price,
	snapshots,
	featureStripeProductIds,
	features,
	claimed,
}: {
	price: Price;
	snapshots: StripeItemSnapshot[];
	featureStripeProductIds: Map<string, string>;
	features: Feature[];
	claimed: Set<string>;
}): StripeItemSnapshot | undefined => {
	if (isFixedPrice(price)) {
		return licensedSnapshotForFixedPrice({
			config: price.config,
			snapshots,
			claimed,
		});
	}
	if (isUsagePrice({ price })) {
		return snapshotForUsagePrice({
			price,
			config: price.config as UsagePriceConfig,
			snapshots,
			featureStripeProductIds,
			features,
			claimed,
		});
	}
	return undefined;
};

const stampStripeIdsFromSnapshot = ({
	price,
	snapshot,
}: {
	price: Price;
	snapshot: StripeItemSnapshot;
}): void => {
	price.config.stripe_price_id = snapshot.stripe_price_id;
	price.config.stripe_product_id ??= snapshot.stripe_product_id;
	if (isUsagePrice({ price }) && snapshot.stripe_meter_id) {
		(price.config as UsagePriceConfig).stripe_meter_id =
			snapshot.stripe_meter_id;
	}
};

/**
 * Stamp Stripe resource ids onto sync-created custom prices from the live
 * subscription. The dashboard round-trip drops the internal `stripe_price_id`
 * from `customize`, so any custom price missing one is re-linked here to the
 * Stripe line it came from. Mutates config in place — `customPrices` and
 * `fullProduct.prices` share the same price references.
 */
export const restampSyncedStripeResources = ({
	customPrices,
	snapshots,
	features,
	catalogPrices,
}: {
	customPrices: Price[];
	snapshots: StripeItemSnapshot[];
	features: Feature[];
	catalogPrices: Price[];
}): void => {
	const featureStripeProductIds = buildFeatureStripeProductIds({
		catalogPrices,
	});
	const claimed = new Set<string>();

	// Usage prices claim first: they match a specific Stripe product/meter, so
	// they take their line before the amount-only base match can.
	const usageFirst = [
		...customPrices.filter((price) => isUsagePrice({ price })),
		...customPrices.filter((price) => !isUsagePrice({ price })),
	];

	for (const price of usageFirst) {
		if (price.config.stripe_price_id) continue;

		const snapshot = findSnapshotForCustomPrice({
			price,
			snapshots,
			featureStripeProductIds,
			features,
			claimed,
		});
		if (!snapshot) continue;

		claimed.add(snapshot.id);
		stampStripeIdsFromSnapshot({ price, snapshot });
	}
};
