import type { Organization } from "@models/orgModels/orgTable";
import type { Entitlement } from "@models/productModels/entModels/entModels";
import { priceConfigForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import type { UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { orgToCurrency } from "@utils/orgUtils/convertOrgUtils";
import { isNotFinalTier } from "@utils/productUtils/priceUtils/classifyPriceUtils";
import { atmnToStripeAmountDecimal } from "@utils/productUtils/priceUtils/convertAmountUtils";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";

/** Per-unit Stripe tiers for a quantity of total usage; a free leading tier covers the allowance.
 * `withFlatAmounts: false` for metered prices, whose quantity stays 0 so tier 1's fee would bill every cycle. */
export const priceToStripeUnitTiers = ({
	price,
	entitlement,
	org,
	currency: targetCurrency,
	withFlatAmounts = true,
}: {
	price: Price;
	entitlement: Entitlement;
	org: Organization;
	currency?: string;
	withFlatAmounts?: boolean;
}): Stripe.PriceCreateParams.Tier[] => {
	const config = price.config as UsagePriceConfig;
	const orgDefault = orgToCurrency({ org }).toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();
	const usageTiers =
		priceConfigForCurrency({ config, currency, orgDefault }).usage_tiers ??
		config.usage_tiers;
	const allowance = entitlement.allowance ?? 0;

	const tiers: Stripe.PriceCreateParams.Tier[] = [];

	if (allowance) {
		tiers.push({
			unit_amount_decimal: "0",
			up_to: allowance,
		});
	}

	for (const tier of usageTiers) {
		const atmnUnitAmount = new Decimal(tier.amount ?? 0).div(
			config.billing_units ?? 1,
		);

		const stripeTier: Stripe.PriceCreateParams.Tier = {
			unit_amount_decimal: atmnToStripeAmountDecimal({
				amount: atmnUnitAmount,
				currency,
			}),
			up_to: isNotFinalTier(tier) ? tier.to + allowance : "inf",
		};

		if (withFlatAmounts && tier.flat_amount) {
			stripeTier.flat_amount_decimal = atmnToStripeAmountDecimal({
				amount: tier.flat_amount,
				currency,
			});
		}

		tiers.push(stripeTier);
	}

	return tiers;
};
