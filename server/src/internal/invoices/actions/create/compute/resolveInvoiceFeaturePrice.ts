import {
	type BillingMethod,
	ErrCode,
	type FullProduct,
	type InvoiceCustomizeItem,
	type InvoiceFeatureQuantity,
	type Price,
	planItemV1ToPriceAndEnt,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	findInvoiceFeaturePrice,
	findOptionalInvoiceFeaturePrice,
} from "./findInvoiceFeaturePrice";

type InvoiceItemPrice = NonNullable<InvoiceCustomizeItem["price"]>;

const findCustomizedPrice = ({
	customizeItems,
	featureId,
}: {
	customizeItems?: InvoiceCustomizeItem[];
	featureId: string;
}) => customizeItems?.find((item) => item.feature_id === featureId)?.price;

/** Overlays the invoice's pricing on the catalog price, keeping its Stripe mappings. */
const overlayCustomizedPrice = ({
	catalogPrice,
	override,
}: {
	catalogPrice: Price;
	override: InvoiceItemPrice;
}): Price => ({
	...catalogPrice,
	is_custom: true,
	// The override replaces the whole price, so an omitted tier_behavior is graduated, as in the catalog.
	tier_behavior: override.tier_behavior ?? null,
	config: {
		...catalogPrice.config,
		interval: override.interval,
		interval_count: override.interval_count,
		billing_units: override.billing_units ?? 1,
		usage_tiers: override.tiers
			? override.tiers.map((tier) => ({
					to: tier.to,
					amount: tier.amount ?? 0,
					flat_amount: tier.flat_amount,
				}))
			: [{ to: "inf" as const, amount: override.amount ?? 0 }],
		stripe_price_id:
			override.processors?.stripe?.price_id ??
			catalogPrice.config.stripe_price_id,
	} as Price["config"],
});

/** In-memory price for a feature the catalog plan does not price this way; null when the override is free and names no Stripe price. */
const mintCustomizedPrice = ({
	ctx,
	product,
	featureId,
	override,
}: {
	ctx: AutumnContext;
	product: FullProduct;
	featureId: string;
	override: InvoiceItemPrice;
}): Price | null => {
	const { processors, ...price } = override;
	// A named Stripe price bills its own amount, so a zero inline amount must not mint a free feature.
	const pricing =
		processors?.stripe?.price_id && !price.tiers
			? {
					...price,
					amount: undefined,
					tiers: [{ to: "inf" as const, amount: price.amount ?? 0 }],
				}
			: price;
	return planItemV1ToPriceAndEnt({
		ctx,
		item: { feature_id: featureId, included: 0, price: pricing },
		orgId: product.org_id,
		internalProductId: product.internal_id,
		isCustom: true,
	}).newPrice;
};

/**
 * The price that bills a feature on this invoice: the catalog price for the
 * requested behavior, customized when the invoice overrides it, or minted from
 * the override when the catalog has no price for that behavior. Null means the
 * invoice customized the feature to free, so it bills nothing.
 */
export const resolveInvoiceFeaturePrice = ({
	ctx,
	customizeItems,
	product,
	entry,
}: {
	ctx: AutumnContext;
	customizeItems?: InvoiceCustomizeItem[];
	product: FullProduct;
	entry: InvoiceFeatureQuantity;
}): Price | null => {
	const featureId = entry.feature_id;
	const billingBehavior: BillingMethod = entry.billing_behavior;
	const override = findCustomizedPrice({ customizeItems, featureId });
	const catalogPrice = findOptionalInvoiceFeaturePrice({
		prices: product.prices,
		featureId,
		billingBehavior,
	});

	if (catalogPrice) {
		if (!override) return catalogPrice;
		if (override.billing_method !== billingBehavior) {
			throw new RecaseError({
				message: `customize.items prices feature ${featureId} as ${override.billing_method}, but feature_quantities bills it as ${billingBehavior}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return overlayCustomizedPrice({ catalogPrice, override });
	}

	if (override?.billing_method === billingBehavior) {
		return mintCustomizedPrice({ ctx, product, featureId, override });
	}
	return findInvoiceFeaturePrice({
		prices: product.prices,
		featureId,
		billingBehavior,
	});
};
