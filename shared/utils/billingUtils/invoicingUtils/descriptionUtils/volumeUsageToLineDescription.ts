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
	billedUsage,
	billedTier,
	billedTierFirstUnit,
	context,
	includePeriodDescription = true,
}: {
	billedUsage: number;
	billedTier: UsageTier;
	billedTierFirstUnit: number;
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
	let tierPrice = format(billedTier.amount);
	if (billingUnits > 1) tierPrice += ` per ${numberWithCommas(billingUnits)}`;
	if (billedTier.flat_amount) {
		tierPrice += ` + ${format(billedTier.flat_amount)} flat`;
	}

	const firstUnit = numberWithCommas(billedTierFirstUnit);
	let tierRange = `${firstUnit}+`;
	if (isNotFinalTier(billedTier)) {
		tierRange = `${firstUnit}–${numberWithCommas(billedTier.to)}`;
	}

	let description = `${product.name} - ${feature?.name}: ${numberWithCommas(billedUsage)} @ ${tierPrice} (volume tier ${tierRange})`;

	if (!isOneOffPrice(price) && includePeriodDescription) {
		description = `${description} (${lineItemToPeriodDescription({ context })})`;
	}
	if (context.direction === "refund") description = `Unused ${description}`;

	return description;
};
