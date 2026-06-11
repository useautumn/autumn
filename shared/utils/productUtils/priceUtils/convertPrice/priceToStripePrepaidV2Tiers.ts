import type { Organization } from "@models/orgModels/orgTable";
import type { Entitlement } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { orgToCurrency } from "@utils/orgUtils/convertOrgUtils";
import {
	isNotFinalTier,
	isPrepaidPrice,
} from "@utils/productUtils/priceUtils/classifyPriceUtils";
import { atmnToStripeAmountDecimal } from "@utils/productUtils/priceUtils/convertAmountUtils";
import { Decimal } from "decimal.js";
import Stripe from "stripe";

/**
 * Builds the Stripe tier array for a V2 prepaid price.
 *
 * For both graduated and volume prices with an allowance, a free $0 leading
 * tier is inserted and all paid-tier boundaries are shifted up by the allowance.
 * Stripe receives total packs (purchased + allowance) as the quantity.
 *
 * - **Graduated**: Stripe splits charges across tier bands. The free tier
 *   covers the included units at $0, so only units above the allowance incur cost.
 * - **Volume**: if total quantity exceeds the free tier, the ENTIRE quantity
 *   (including the included portion) is charged at the matching paid tier's
 *   rate. This is intentional — volume pricing does not subtract included
 *   usage before applying the rate.
 */
export const priceToStripePrepaidV2Tiers = ({
	price,
	entitlement,
	org,
}: {
	price: Price;
	entitlement: Entitlement;
	org: Organization;
}): Stripe.PriceCreateParams.Tier[] => {
	if (!isPrepaidPrice(price)) {
		throw new Error(
			`priceToStripePrepaidV2Tiers requires a prepaid price, got price ${price.id}`,
		);
	}
	const config = price.config;

	const tiers: Stripe.PriceCreateParams.Tier[] = [];

	// Insert a free leading tier and shift paid-tier boundaries up by the
	// allowance. Applies to both graduated and volume pricing.
	if (entitlement.allowance) {
		tiers.push({
			unit_amount_decimal: Stripe.Decimal.zero,
			up_to: entitlement.allowance,
		});
	}

	for (const tier of config.usage_tiers) {
		const atmnUnitAmount = new Decimal(tier.amount ?? 0).div(
			config.billing_units ?? 1,
		);

		const stripeUnitAmountDecimal = atmnToStripeAmountDecimal({
			amount: atmnUnitAmount,
			currency: orgToCurrency({ org }),
		});

		let upTo: Stripe.PriceCreateParams.Tier["up_to"] = "inf";
		if (isNotFinalTier(tier)) {
			upTo = entitlement.allowance ? tier.to + entitlement.allowance : tier.to;
		}

		const stripeTier: Stripe.PriceCreateParams.Tier = {
			unit_amount_decimal: stripeUnitAmountDecimal,
			up_to: upTo,
		};

		if (tier.flat_amount) {
			stripeTier.flat_amount_decimal = atmnToStripeAmountDecimal({
				amount: tier.flat_amount,
				currency: orgToCurrency({ org }),
			});
		}

		tiers.push(stripeTier);
	}

	// Divide tier boundaries by billing units and scale unit amounts up.
	// flat_amount_decimal is per-tier (not per-unit), so it passes through unscaled.
	return tiers.map((tier, index) => ({
		...tier,

		up_to:
			index === tiers.length - 1 || tier.up_to === "inf"
				? "inf"
				: new Decimal(tier.up_to)
						.div(config.billing_units ?? 1)
						.ceil()
						.toNumber(),

		unit_amount_decimal: Stripe.Decimal.from(
			new Decimal(tier.unit_amount_decimal?.toString() ?? "0")
				.mul(config.billing_units ?? 1)
				.toString(),
		),
	}));
};
