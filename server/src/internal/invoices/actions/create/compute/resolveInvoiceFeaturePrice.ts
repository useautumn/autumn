import {
	type BillingMethod,
	type FullProduct,
	type InvoiceFeatureQuantity,
	type Price,
	planItemV1ToPriceAndEnt,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { InvoicePlanContext } from "../setup/setupCreateInvoiceContext";
import {
	findInvoiceFeaturePrice,
	findOptionalInvoiceFeaturePrice,
} from "./findInvoiceFeaturePrice";

type InvoiceItemPrice = NonNullable<
	NonNullable<
		NonNullable<InvoicePlanContext["params"]["customize"]>["items"]
	>[number]["price"]
>;

const findCustomizedPrice = ({
	plan,
	featureId,
}: {
	plan: InvoicePlanContext;
	featureId: string;
}) =>
	plan.params.customize?.items?.find((item) => item.feature_id === featureId)
		?.price;

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
	tier_behavior: override.tier_behavior ?? catalogPrice.tier_behavior,
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

/** In-memory price for a feature the catalog plan does not price this way; never written to the catalog. */
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
}): Price | undefined => {
	const { processors: _processors, ...price } = override;
	return (
		planItemV1ToPriceAndEnt({
			ctx,
			item: { feature_id: featureId, included: 0, price },
			orgId: product.org_id,
			internalProductId: product.internal_id,
			isCustom: true,
		}).newPrice ?? undefined
	);
};

/**
 * The price that bills a feature on this invoice: the catalog price for the
 * requested behavior, customized when the invoice overrides it, or minted from
 * the override when the catalog has no price for that behavior.
 */
export const resolveInvoiceFeaturePrice = ({
	ctx,
	plan,
	product,
	entry,
}: {
	ctx: AutumnContext;
	plan: InvoicePlanContext;
	product: FullProduct;
	entry: InvoiceFeatureQuantity;
}): Price => {
	const featureId = entry.feature_id;
	const billingBehavior: BillingMethod = entry.billing_behavior;
	const override = findCustomizedPrice({ plan, featureId });
	const catalogPrice = findOptionalInvoiceFeaturePrice({
		prices: product.prices,
		featureId,
		billingBehavior,
	});

	if (catalogPrice) {
		return override
			? overlayCustomizedPrice({ catalogPrice, override })
			: catalogPrice;
	}

	const overrideBillsBehavior = override?.billing_method === billingBehavior;
	const minted = overrideBillsBehavior
		? mintCustomizedPrice({ ctx, product, featureId, override })
		: undefined;
	return (
		minted ??
		findInvoiceFeaturePrice({
			prices: product.prices,
			featureId,
			billingBehavior,
		})
	);
};
