import type { Organization } from "@models/orgModels/orgTable";
import type { Entitlement } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { isPrepaidPrice } from "@utils/productUtils/priceUtils/classifyPriceUtils";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { priceToStripeUnitTiers } from "./priceToStripeUnitTiers";

/**
 * Builds the Stripe tier array for a V2 prepaid price: the per-unit tiers
 * (see priceToStripeUnitTiers) converted to packs of billing units, since
 * Stripe receives total packs (purchased + allowance) as the quantity.
 */
export const priceToStripePrepaidV2Tiers = ({
	price,
	entitlement,
	org,
	currency,
}: {
	price: Price;
	entitlement: Entitlement;
	org: Organization;
	currency?: string;
}): Stripe.PriceCreateParams.Tier[] => {
	if (!isPrepaidPrice(price)) {
		throw new Error(
			`priceToStripePrepaidV2Tiers requires a prepaid price, got price ${price.id}`,
		);
	}
	const billingUnits = price.config.billing_units ?? 1;
	const tiers = priceToStripeUnitTiers({ price, entitlement, org, currency });

	return tiers.map((tier, index) => ({
		...tier,

		up_to:
			index === tiers.length - 1 || tier.up_to === "inf"
				? "inf"
				: new Decimal(tier.up_to).div(billingUnits).ceil().toNumber(),

		unit_amount_decimal: new Decimal(tier.unit_amount_decimal ?? 0)
			.mul(billingUnits)
			.toString(),
	}));
};
