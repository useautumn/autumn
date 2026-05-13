import { type Entitlement, nullish, type Price } from "@autumn/shared";
import { getPriceStripeReuseLevel } from "./getPriceStripeReuseLevel.js";

const stripeResourceFields = [
	"stripe_product_id",
	"stripe_price_id",
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
	"stripe_prepaid_price_v2_id",
	"stripe_meter_id",
	"stripe_event_name",
] as const;

export type StripeResourceField = (typeof stripeResourceFields)[number];

type StripeResourceConfig = Partial<Record<StripeResourceField, string | null>>;

const copyField = ({
	fromConfig,
	toConfig,
	field,
}: {
	fromConfig: StripeResourceConfig;
	toConfig: StripeResourceConfig;
	field: StripeResourceField;
}) => {
	if (!nullish(toConfig[field])) return false;
	if (nullish(fromConfig[field])) return false;

	toConfig[field] = fromConfig[field];
	return true;
};

/**
 * Copy Stripe resource IDs (and `stripe_event_name`) from the best-matching
 * candidate price onto `targetPrice.config`, in place. Returns the fields that
 * were copied.
 *
 * Two-pass search: a "full" match (identical config + paired entitlement) is
 * preferred over a "stripeProductOnly" match (same feature/entity scope). For
 * "full" matches every Stripe resource field is copied; for "stripeProductOnly"
 * only `stripe_product_id` is copied so a fresh price is later minted under the
 * existing per-feature Stripe product.
 */
export const copyStripeResourcesToMatchingPrice = ({
	targetPrice,
	candidatePrices,
	targetEntitlements,
	candidateEntitlements,
}: {
	targetPrice: Price;
	candidatePrices: Price[];
	targetEntitlements: Entitlement[];
	candidateEntitlements: Entitlement[];
}): { copiedFields: StripeResourceField[] } => {
	const levels = candidatePrices.map((candidatePrice) => ({
		candidatePrice,
		level: getPriceStripeReuseLevel({
			newPrice: targetPrice,
			candidatePrice,
			newEntitlements: targetEntitlements,
			candidateEntitlements,
		}),
	}));

	const fullMatch = levels.find((entry) => entry.level === "full");
	const productOnlyMatch =
		fullMatch ?? levels.find((entry) => entry.level === "stripeProductOnly");

	const productSource = productOnlyMatch?.candidatePrice;
	const fullSource = fullMatch?.candidatePrice;

	const targetConfig = targetPrice.config as StripeResourceConfig;
	const copiedFields: StripeResourceField[] = [];

	if (productSource) {
		const fromConfig = productSource.config as StripeResourceConfig;
		if (
			copyField({
				fromConfig,
				toConfig: targetConfig,
				field: "stripe_product_id",
			})
		) {
			copiedFields.push("stripe_product_id");
		}
	}

	if (fullSource) {
		const fromConfig = fullSource.config as StripeResourceConfig;
		for (const field of stripeResourceFields) {
			if (field === "stripe_product_id") continue;
			if (
				copyField({
					fromConfig,
					toConfig: targetConfig,
					field,
				})
			) {
				copiedFields.push(field);
			}
		}
	}

	return { copiedFields };
};
