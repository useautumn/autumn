import type { Organization } from "@models/orgModels/orgTable";
import type { Entitlement } from "@models/productModels/entModels/entModels";
import { type UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
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
 * For **graduated** prices with an allowance, a free leading tier is inserted
 * and all paid-tier boundaries are shifted up by the allowance. Stripe's
 * graduated mode splits charges across tiers, so the free tier naturally
 * covers the included units.
 *
 * For **volume** prices, the free-tier offset approach does not work: Stripe
 * volume mode charges the *entire* quantity at the rate of the single matching
 * tier, so a leading $0 tier would corrupt the math. Volume prices therefore
 * use the same flat tier boundaries as the V1 price. The allowance is tracked
 * purely by Autumn; see `featureOptionsToV2StripeQuantity` for how the
 * Stripe quantity is kept to paid packs only for volume prices.
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

	// Graduated + allowance: insert a free leading tier and shift paid-tier
	// boundaries up by the allowance so Stripe's per-tier splitting gives the
	// right amount. Volume prices skip this — the allowance is handled outside
	// of Stripe (see featureOptionsToV2StripeQuantity).
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

		tiers.push({
			unit_amount_decimal: stripeUnitAmountDecimal,
			up_to: isFinalTier(tier) ? "inf" : upTo,
		});
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
