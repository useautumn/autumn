import type { Organization } from "@models/orgModels/orgTable";
import type { Entitlement } from "@models/productModels/entModels/entModels";
import type { UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { orgToCurrency } from "@utils/orgUtils/convertOrgUtils";
import {
	isFinalTier,
	isNotFinalTier,
} from "@utils/productUtils/priceUtils/classifyPriceUtils";
import { atmnToStripeAmountDecimal } from "@utils/productUtils/priceUtils/convertAmountUtils";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";

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
}) => {
	const config = price.config as UsagePriceConfig;

	const tiers: Stripe.PriceCreateParams.Tier[] = [];

	// Insert a free leading tier and shift paid-tier boundaries up by the
	// allowance. Applies to both graduated and volume pricing.
	if (entitlement.allowance) {
		tiers.push({
			unit_amount_decimal: "0",
			up_to: entitlement.allowance,
		});
	}

	for (let i = 0; i < config.usage_tiers.length; i++) {
		const tier = config.usage_tiers[i];
		const atmnUnitAmount = new Decimal(tier.amount).div(
			config.billing_units ?? 1,
		);

		const stripeUnitAmountDecimal = atmnToStripeAmountDecimal({
			amount: atmnUnitAmount,
			currency: orgToCurrency({ org }),
		});

		let upTo = tier.to;
		if (isNotFinalTier(tier) && entitlement.allowance) {
			upTo = tier.to + entitlement.allowance;
		}

		const stripeTier: Stripe.PriceCreateParams.Tier = {
			unit_amount_decimal: stripeUnitAmountDecimal,
			up_to: isFinalTier(tier) ? "inf" : upTo,
		};

		if (tier.flat_amount) {
			stripeTier.flat_amount_decimal = atmnToStripeAmountDecimal({
				amount: tier.flat_amount,
				currency: orgToCurrency({ org }),
			});
		}

		tiers.push(stripeTier);
	}

	// Divide all tiers by billing units
	const dividedTiers = tiers.map((tier, index: number) => ({
		...tier,

		up_to:
			index === tiers.length - 1
				? "inf"
				: new Decimal(tier.up_to ?? 0)
						.div(config.billing_units ?? 1)
						.ceil()
						.toNumber(),

		unit_amount_decimal: new Decimal(tier.unit_amount_decimal ?? 0)
			.mul(config.billing_units ?? 1)
			.toString(),
	}));

	return dividedTiers;
};
