import {
	type Entitlement,
	type EntitlementWithFeature,
	entsAreSame,
	isPreviewStripeId,
	type Price,
	PriceType,
	pricesAreSame,
	priceToEnt,
	type UsagePriceConfig,
} from "@autumn/shared";

export type PriceStripeReuseLevel = "full" | "stripeProductOnly" | "none";

const stripeResourceFields = [
	"stripe_product_id",
	"stripe_price_id",
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
	"stripe_prepaid_price_v2_id",
	"stripe_meter_id",
	"stripe_event_name",
] as const;

const priceHasPreviewStripeId = ({ price }: { price: Price }) => {
	const config = price.config as Partial<
		Record<(typeof stripeResourceFields)[number], string | null>
	>;
	return stripeResourceFields.some((field) =>
		isPreviewStripeId({ stripeId: config[field] }),
	);
};

const findPairedEntitlement = ({
	price,
	entitlements,
}: {
	price: Price;
	entitlements: Entitlement[];
}): Entitlement | undefined =>
	priceToEnt({
		price,
		entitlements: entitlements as EntitlementWithFeature[],
	});

const normalizeOptionalId = (value?: string | null) => value || null;

/**
 * Classify how much of the Stripe resource set on `candidatePrice` can be
 * carried forward onto `newPrice` when the two represent the same logical
 * Autumn price across a plan-update or version transition.
 *
 * - "full"               — config + paired entitlement are identical; reuse all stripe_*_id + stripe_event_name fields.
 * - "stripeProductOnly"  — same (feature_id, entity_feature_id) usage scope; reuse just stripe_product_id so a new price is created under the existing plan-feature Stripe product.
 * - "none"               — no reuse, or candidate is preview-only.
 */
export const getPriceStripeReuseLevel = ({
	newPrice,
	candidatePrice,
	newEntitlements,
	candidateEntitlements,
}: {
	newPrice: Price;
	candidatePrice: Price;
	newEntitlements: Entitlement[];
	candidateEntitlements: Entitlement[];
}): PriceStripeReuseLevel => {
	if (priceHasPreviewStripeId({ price: candidatePrice })) return "none";
	if (newPrice.config?.type !== candidatePrice.config?.type) return "none";

	if (pricesAreSame(candidatePrice, newPrice, false)) {
		if (newPrice.config?.type !== PriceType.Usage) return "full";

		const newEnt = findPairedEntitlement({
			price: newPrice,
			entitlements: newEntitlements,
		});
		const candidateEnt = findPairedEntitlement({
			price: candidatePrice,
			entitlements: candidateEntitlements,
		});

		// Both null = same (null) entity scope; both have ents = compare them.
		if (!newEnt && !candidateEnt) return "full";
		if (!newEnt || !candidateEnt) return "none";
		if (entsAreSame(candidateEnt, newEnt)) return "full";
	}

	if (newPrice.config?.type !== PriceType.Usage) return "none";

	const newUsageConfig = newPrice.config as UsagePriceConfig;
	const candidateUsageConfig = candidatePrice.config as UsagePriceConfig;
	if (newUsageConfig.feature_id !== candidateUsageConfig.feature_id) {
		return "none";
	}

	const newEnt = findPairedEntitlement({
		price: newPrice,
		entitlements: newEntitlements,
	});
	const candidateEnt = findPairedEntitlement({
		price: candidatePrice,
		entitlements: candidateEntitlements,
	});

	if (!newEnt && !candidateEnt) return "stripeProductOnly";
	if (!newEnt || !candidateEnt) return "none";
	if (
		normalizeOptionalId(newEnt.entity_feature_id) !==
		normalizeOptionalId(candidateEnt.entity_feature_id)
	) {
		return "none";
	}

	return "stripeProductOnly";
};
