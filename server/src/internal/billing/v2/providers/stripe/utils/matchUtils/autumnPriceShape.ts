import {
	atmnToStripeAmountDecimal,
	type Entitlement,
	type FixedPriceConfig,
	isAllocatedPrice,
	isConsumablePrice,
	isPrepaidPrice,
	isVolumePrice,
	type Organization,
	type Price,
	priceAmountsForCurrency,
	priceToStripeTiersMode,
	priceToStripeUnitTiers,
} from "@autumn/shared";
import { priceToStripePrepaidV2Tiers } from "@utils/productUtils/priceUtils/convertPrice/priceToStripePrepaidV2Tiers";
import { priceToStripeRecurringParams } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";
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
	tiers: ReturnType<typeof priceToStripeUnitTiers>;
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

	const isVolume = isVolumePrice(price);
	const hasFlatAmountKey = price.config.usage_tiers.some(
		(tier) => tier.flat_amount != null,
	);
	if (!isVolume && hasFlatAmountKey) return null;

	const recurring = priceToStripeRecurringParams({ price });
	if (!recurring) return null;

	const tiers = priceToStripeUnitTiers({
		price,
		entitlement,
		org,
		currency,
		skipFlatFees: isVolume,
	});
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
			tiers_mode: priceToStripeTiersMode({ price }),
			tiers: autumnTiersToShape({ tiers }),
		},
	});
};

export const autumnAllocatedPriceToStripePriceShape = ({
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
	if (!isAllocatedPrice(price)) return null;

	const recurring = priceToStripeRecurringParams({ price });
	if (!recurring) return null;

	const tiers = priceToStripeUnitTiers({ price, entitlement, org, currency });
	if (tiers.length === 1) {
		const tier = tiers[0]!;
		return inlinePriceToShape({
			price: {
				product: stripeProductId,
				currency,
				billing_scheme: "per_unit",
				recurring,
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
			recurring,
			tiers_mode: priceToStripeTiersMode({ price }),
			tiers: autumnTiersToShape({ tiers }),
		},
	});
};

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
