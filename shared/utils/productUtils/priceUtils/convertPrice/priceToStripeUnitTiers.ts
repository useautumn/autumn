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

/**
 * Builds a usage price's Stripe tiers per single unit, for a Stripe quantity of
 * total usage (included units + overage).
 *
 * Stored tiers are net of the included units, so with an allowance a free $0
 * leading tier covers the included units and every paid boundary is shifted
 * up by the allowance.
 *
 * - **Graduated**: Stripe splits charges across bands, so only units above the
 *   allowance cost anything.
 * - **Volume**: once total usage passes the free tier, the ENTIRE quantity
 *   (included units too) is charged at the band total usage lands in, plus
 *   that band's flat_amount. At or below the allowance it lands in the free
 *   tier, which has no flat fee, so it costs $0.
 */
export const priceToStripeUnitTiers = ({
	price,
	entitlement,
	org,
	currency: targetCurrency,
}: {
	price: Price;
	entitlement: Entitlement;
	org: Organization;
	currency?: string;
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

		if (tier.flat_amount) {
			stripeTier.flat_amount_decimal = atmnToStripeAmountDecimal({
				amount: tier.flat_amount,
				currency,
			});
		}

		tiers.push(stripeTier);
	}

	return tiers;
};
