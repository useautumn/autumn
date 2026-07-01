import {
	atmnToStripeAmountDecimal,
	type Entitlement,
	type FixedPriceConfig,
	isConsumablePrice,
	type Organization,
	type Price,
	TierBehavior,
	type UsagePriceConfig,
} from "@autumn/shared";
import { priceToStripeRecurringParams } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";
import { priceToInArrearTiers } from "@/external/stripe/createStripePrice/createStripeInArrear";
import {
	inlinePriceToShape,
	stripeShapeDecimalAmount,
	type StripePriceShape,
	type StripePriceShapeTier,
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

	return inlinePriceToShape({
		price: {
			product: stripeProductId,
			currency,
			billing_scheme: "per_unit",
			recurring,
			unit_amount_decimal: atmnToStripeAmountDecimal({
				amount: price.config.amount,
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

	const tiers = priceToInArrearTiers({ price, entitlement, org });
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
