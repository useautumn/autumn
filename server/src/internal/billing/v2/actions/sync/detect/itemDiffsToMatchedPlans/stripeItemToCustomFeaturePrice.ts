import {
	type CreatePlanItemParamsV1,
	type FullProduct,
	mapToProductItems,
	type Price,
	type SharedContext,
	stripeToAtmnAmount,
	TierBehavior,
} from "@autumn/shared";
import { productItemToPlanItemParamsV1 } from "@shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemToPlanItemParamsV1";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";

type StripePriceOverride =
	| { amount: number }
	| { tiers: { to: number | "inf"; amount: number }[] };

/** Read the amount off a Stripe line, as either a flat amount or usage tiers. */
const stripePriceOverride = ({
	item,
}: {
	item: StripeItemSnapshot;
}): StripePriceOverride | null => {
	if (!item.currency) return null;

	if (item.tiers && item.tiers.length > 0) {
		const tiers = item.tiers.map((tier) => ({
			to: tier.up_to ?? ("inf" as const),
			amount: stripeToAtmnAmount({
				amount: Number(tier.unit_amount_decimal ?? tier.unit_amount ?? 0),
				currency: item.currency as string,
			}),
		}));
		return { tiers };
	}

	const rawAmount = item.unit_amount_decimal ?? item.unit_amount;
	if (rawAmount === null) return null;
	const amount = Number(rawAmount);
	if (!Number.isFinite(amount)) return null;
	return { amount: stripeToAtmnAmount({ amount, currency: item.currency }) };
};

/**
 * Rebuild a matched usage price as a custom plan item: keep the catalog
 * feature, included allowance, reset and units, and take only the amount
 * from Stripe. Returns null when the item can't express an Autumn price.
 */
export const stripeItemToCustomFeaturePrice = ({
	ctx,
	item,
	matchedPrice,
	product,
}: {
	ctx: SharedContext;
	item: StripeItemSnapshot;
	matchedPrice: Price;
	product: FullProduct;
}): CreatePlanItemParamsV1 | null => {
	const entitlement = product.entitlements.find(
		(ent) => ent.id === matchedPrice.entitlement_id,
	);
	if (!entitlement) return null;

	const [productItem] = mapToProductItems({
		prices: [matchedPrice],
		entitlements: [entitlement],
		features: ctx.features,
	});
	if (!productItem) return null;

	const params = productItemToPlanItemParamsV1({ ctx, item: productItem });
	if (!params.price) return null;

	const override = stripePriceOverride({ item });
	if (!override) return null;

	const { amount: _amount, tiers: _tiers, ...priceRest } = params.price;
	const tierBehavior =
		"tiers" in override && item.tiers_mode === "volume"
			? { tier_behavior: TierBehavior.VolumeBased }
			: {};

	return {
		...params,
		price: {
			...priceRest,
			...override,
			...tierBehavior,
			stripe_price_id: item.stripe_price_id,
		},
	};
};
