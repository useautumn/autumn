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

const overlayCustomizedPrice = ({
	catalogPrice,
	override,
}: {
	catalogPrice: Price;
	override: InvoiceItemPrice;
}): Price => ({
	...catalogPrice,
	is_custom: true,
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
