import {
	type Entitlement,
	isConsumablePrice,
	isFixedPrice,
	isNotFinalTier,
	isPrepaidPrice,
	type Organization,
	type Price,
	type ProcessorItemPrice,
	priceAmountsForCurrency,
	priceToStripeTiersMode,
	type UsageTier,
} from "@autumn/shared";
import { priceToStripePrepaidV2Tiers } from "@utils/productUtils/priceUtils/convertPrice/priceToStripePrepaidV2Tiers";
import { billingIntervalToStripe } from "@/external/stripe/stripePriceUtils";
import { stripeTiersToProcessorItemTiers } from "./stripeTiersToProcessorItemTiers";

const usageTiersToProcessorItemTiers = (tiers: UsageTier[]) =>
	tiers.map((tier) => ({
		up_to: isNotFinalTier(tier) ? tier.to : null,
		unit_amount: tier.amount,
		flat_amount: tier.flat_amount ?? 0,
	}));

/** Prepaid tiers exactly as Autumn will create them in Stripe, so the quantity prices the same way. */
const prepaidStripeTiers = ({
	price,
	entitlement,
	org,
	currency,
}: {
	price: Price;
	entitlement: Entitlement;
	org: Organization;
	currency: string;
}) =>
	stripeTiersToProcessorItemTiers({
		tiers: priceToStripePrepaidV2Tiers({ price, entitlement, org, currency }),
		currency,
	});

/** For prices Stripe doesn't have yet (created on confirm), describe them from Autumn's config. */
export const autumnPriceToProcessorItemPrice = ({
	price,
	entitlement,
	org,
	currency,
}: {
	price: Price;
	entitlement?: Entitlement;
	org: Organization;
	currency: string;
}): ProcessorItemPrice => {
	const { config } = price;
	const amounts = priceAmountsForCurrency({ config, currency });
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
			unit_amount: amounts.amount ?? price.config.amount,
			...recurrence,
			usage_type: "licensed",
			tiers_mode: null,
			tiers: null,
			units_per_quantity: null,
		};
	}

	const unitsPerQuantity = config.billing_units ?? null;
	const tiers =
		isPrepaidPrice(price) && entitlement
			? prepaidStripeTiers({ price, entitlement, org, currency })
			: usageTiersToProcessorItemTiers(
					amounts.usage_tiers ?? config.usage_tiers ?? [],
				);
	const [firstTier] = tiers;
	const isFlatRate =
		tiers.length === 1 && firstTier !== undefined && !firstTier.flat_amount;

	return {
		currency,
		unit_amount: isFlatRate ? firstTier.unit_amount : null,
		...recurrence,
		usage_type: isConsumablePrice(price) ? "metered" : "licensed",
		tiers_mode: isFlatRate ? null : priceToStripeTiersMode({ price }),
		tiers: isFlatRate ? null : tiers,
		units_per_quantity: unitsPerQuantity,
	};
};
