import {
	atmnToStripeAmountDecimal,
	type Entitlement,
	type FixedPriceConfig,
	isConsumablePrice,
	isPrepaidPrice,
	type Organization,
	type Price,
	priceAmountsForCurrency,
	priceToStripeTiersMode,
	TierBehavior,
	type UsagePriceConfig,
} from "@autumn/shared";
import { priceToStripePrepaidV2Tiers } from "@utils/productUtils/priceUtils/convertPrice/priceToStripePrepaidV2Tiers";
import { priceToStripeRecurringParams } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";
import { priceToInArrearTiers } from "@/external/stripe/createStripePrice/createStripeInArrear";
import {
	inlinePriceToShape,
	type StripePriceShape,
	type StripePriceShapeTier,
	stripeShapeDecimalAmount,
} from "./stripePriceShape";

export const autumnBasePriceToStripePriceShape = ({
	price,
	stripeProductId,
	currency,
}: {
	price: Price & { config: FixedPriceConfig };
	stripeProductId: string;
	currency: string;
}): StripePriceShape | null => {
	const recurring = priceToStripeRecurringParams({ price });
	if (!recurring) return null;
	const amount = priceAmountsForCurrency({
		config: price.config,
		currency,
	}).amount;
	if (amount == null) return null;

	return inlinePriceToShape({
		price: {
			product: stripeProductId,
			currency,
			billing_scheme: "per_unit",
			recurring,
			unit_amount_decimal: atmnToStripeAmountDecimal({
				amount,
				currency,
			}),
		},
	});
};

const stripeTierUpTo = (upTo?: number | "inf" | null) => upTo ?? "inf";

const autumnTiersToShape = ({
	tiers,
}: {
	tiers: ReturnType<typeof priceToInArrearTiers>;
}): StripePriceShapeTier[] =>
	tiers.map((tier) => ({
		upTo: stripeTierUpTo(tier.up_to as number | "inf" | null | undefined),
		unitAmountDecimal: stripeShapeDecimalAmount(
			(tier.unit_amount_decimal ?? tier.unit_amount) as
				| string
				| number
				| null
				| undefined,
		),
		flatAmountDecimal: stripeShapeDecimalAmount(
			tier.flat_amount_decimal as string | number | null | undefined,
		),
	}));

export const autumnConsumablePriceToStripePriceShape = ({
	price,
	entitlement,
	stripeProductId,
	currency,
	org,
}: {
	price: Price;
	entitlement: Entitlement;
	stripeProductId: string;
	currency: string;
	org: Organization;
}): StripePriceShape | null => {
	if (!isConsumablePrice(price)) return null;
	// Stripe sync-back only supports graduated tiers for now; volume tiers price usage differently.
	if (price.tier_behavior === TierBehavior.VolumeBased) return null;

	const config = price.config as UsagePriceConfig;
	// Autumn's Stripe price creation path doesn't encode flat tier charges for consumable sync-back yet.
	if (config.usage_tiers.some((tier) => tier.flat_amount != null)) return null;

	const recurring = priceToStripeRecurringParams({ price });
	if (!recurring) return null;

	const tiers = priceToInArrearTiers({ price, entitlement, org, currency });
	const recurringMetered = { ...recurring, usage_type: "metered" };

	if (tiers.length === 1) {
		const tier = tiers[0]!;
		return inlinePriceToShape({
			price: {
				product: stripeProductId,
				currency,
				billing_scheme: "per_unit",
				recurring: recurringMetered,
				unit_amount_decimal: (tier.unit_amount_decimal ?? tier.unit_amount) as
					| string
					| number
					| null
					| undefined,
			},
		});
	}

	return inlinePriceToShape({
		price: {
			product: stripeProductId,
			currency,
			billing_scheme: "tiered",
			recurring: recurringMetered,
			tiers_mode: "graduated",
			tiers: autumnTiersToShape({ tiers }),
		},
	});
};

/**
 * Total (allowance-inclusive) shape of a prepaid price — what Autumn's V2
 * prepaid Stripe price looks like, so Stripe-native licensed prices (e.g.
 * imported catalogs) can be recognized as prepaid by shape.
 */
export const autumnPrepaidPriceToStripePriceShape = ({
	price,
	entitlement,
	stripeProductId,
	currency,
	org,
}: {
	price: Price;
	entitlement: Entitlement;
	stripeProductId: string;
	currency: string;
	org: Organization;
}): StripePriceShape | null => {
	if (!isPrepaidPrice(price)) return null;

	const recurring = priceToStripeRecurringParams({ price });
	if (!recurring) return null;

	const tiers = priceToStripePrepaidV2Tiers({
		price,
		entitlement,
		org,
		currency,
	});

	if (tiers.length === 1) {
		return inlinePriceToShape({
			price: {
				product: stripeProductId,
				currency,
				billing_scheme: "per_unit",
				recurring,
				unit_amount_decimal: tiers[0]?.unit_amount_decimal,
			},
		});
	}

	return inlinePriceToShape({
		price: {
			product: stripeProductId,
			currency,
			billing_scheme: "tiered",
			recurring,
			tiers_mode: priceToStripeTiersMode({ price }),
			tiers: autumnTiersToShape({ tiers }),
		},
	});
};
