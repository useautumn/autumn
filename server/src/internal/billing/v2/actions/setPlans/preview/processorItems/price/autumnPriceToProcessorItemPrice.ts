import {
	Infinite,
	isConsumablePrice,
	isFixedPrice,
	type Price,
	type ProcessorItemPrice,
	type UsageTier,
} from "@autumn/shared";
import { billingIntervalToStripe } from "@/external/stripe/stripePriceUtils";

const usageTierToProcessorItemTier = (tier: UsageTier) => ({
	up_to: tier.to === Infinite ? null : Number(tier.to),
	unit_amount: tier.amount ?? null,
	flat_amount: tier.flat_amount ?? null,
});

const isSingleUnitTier = (tiers: UsageTier[]) =>
	tiers.length === 1 && !tiers[0].flat_amount;

/** For prices Stripe doesn't have yet (created on confirm), describe them from Autumn's config. */
export const autumnPriceToProcessorItemPrice = ({
	price,
	currency,
}: {
	price: Price;
	currency: string;
}): ProcessorItemPrice => {
	const { config } = price;
	const currencyOverride = config.currencies?.[currency.toLowerCase()];
	const stripeRecurring = billingIntervalToStripe({
		interval: config.interval,
		intervalCount: config.interval_count,
	});
	const recurrence = {
		interval: stripeRecurring.interval ?? null,
		interval_count: stripeRecurring.interval_count ?? 1,
	};

	if (isFixedPrice(price)) {
		return {
			currency,
			unit_amount: currencyOverride?.amount ?? price.config.amount,
			...recurrence,
			usage_type: "licensed",
			tiers_mode: null,
			tiers: null,
			units_per_quantity: null,
		};
	}

	const tiers = currencyOverride?.usage_tiers ?? config.usage_tiers ?? [];
	const singleUnitTier = isSingleUnitTier(tiers);

	return {
		currency,
		unit_amount: singleUnitTier ? (tiers[0].amount ?? null) : null,
		...recurrence,
		usage_type: isConsumablePrice(price) ? "metered" : "licensed",
		tiers_mode: singleUnitTier ? null : (price.tier_behavior ?? "graduated"),
		tiers: singleUnitTier ? null : tiers.map(usageTierToProcessorItemTier),
		units_per_quantity: config.billing_units ?? null,
	};
};
