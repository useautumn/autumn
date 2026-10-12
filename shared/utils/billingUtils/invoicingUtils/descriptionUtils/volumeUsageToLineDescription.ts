import type { LineItemContext } from "@models/billingModels/lineItem/lineItemContext";
import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { lineItemToPeriodDescription } from "@utils/billingUtils/invoicingUtils/descriptionUtils/lineItemToPeriodDescription";
import { formatAmount } from "@utils/common/formatUtils/formatAmount";
import { currencyInputDecimals } from "@utils/currencyUtils/stripeCurrencies";
import { numberWithCommas } from "@utils/displayUtils";
import {
	isNotFinalTier,
	isOneOffPrice,
} from "@utils/productUtils/priceUtils/classifyPriceUtils";

/** Describes a volume line by the one tier total usage lands in,
 * e.g. "Pro - Messages: 750 @ $0.08 + $10.00 flat (volume tier 501–2,000)". */
export const volumeUsageToLineDescription = ({
	quantity,
	tiers,
	tier,
	context,
	includePeriodDescription = true,
}: {
	quantity: number;
	/** Tiers in total-usage positions, with the allowance's free tier first. */
	tiers: UsageTier[];
	tier: UsageTier;
	context: LineItemContext;
	includePeriodDescription?: boolean;
}): string => {
	const { price, product, feature, currency } = context;
	const format = (amount: number) =>
		formatAmount({
			currency,
			amount,
			minFractionDigits: currencyInputDecimals(currency),
		});

	const billingUnits = price.config.billing_units ?? 1;
	const perPack =
		billingUnits > 1 ? ` per ${numberWithCommas(billingUnits)}` : "";
	const flatFee = tier.flat_amount ? ` + ${format(tier.flat_amount)} flat` : "";

	const tierIndex = tiers.indexOf(tier);
	const previousTier = tiers[tierIndex - 1];
	const firstUnit = numberWithCommas(
		previousTier && isNotFinalTier(previousTier) ? previousTier.to + 1 : 1,
	);
	const range = isNotFinalTier(tier)
		? `${firstUnit}–${numberWithCommas(tier.to)}`
		: `${firstUnit}+`;

	let description = `${product.name} - ${feature?.name}: ${numberWithCommas(quantity)} @ ${format(tier.amount)}${perPack}${flatFee} (volume tier ${range})`;

	if (!isOneOffPrice(price) && includePeriodDescription) {
		description = `${description} (${lineItemToPeriodDescription({ context })})`;
	}
	if (context.direction === "refund") description = `Unused ${description}`;

	return description;
};
