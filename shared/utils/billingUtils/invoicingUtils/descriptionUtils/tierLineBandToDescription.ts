import { InternalError } from "@api/errors";
import type { LineItemContext } from "@models/billingModels/lineItem/lineItemContext";
import type { TierLineBand } from "@models/billingModels/lineItem/tierLineBand";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { lineItemToPeriodDescription } from "@utils/billingUtils/invoicingUtils/descriptionUtils/lineItemToPeriodDescription";
import { formatAmount } from "@utils/common/formatUtils/formatAmount";
import { currencyInputDecimals } from "@utils/currencyUtils/stripeCurrencies";
import { numberWithCommas } from "@utils/displayUtils";
import { isOneOffPrice } from "@utils/productUtils/priceUtils/classifyPriceUtils";

const bandToTierLabel = ({
	band,
	context,
}: {
	band: TierLineBand;
	context: LineItemContext;
}): string | undefined => {
	const { price } = context;
	const isTiered = (price.config.usage_tiers?.length ?? 0) > 1;
	if (!isTiered) return undefined;

	const tierName =
		price.tier_behavior === TierBehavior.VolumeBased ? "volume tier" : "tier";
	const firstUnit = numberWithCommas(band.tierStart + 1);
	const range =
		band.tierEnd === null
			? `${firstUnit}+`
			: `${firstUnit}–${numberWithCommas(band.tierEnd)}`;

	return `${tierName} ${range}`;
};

const bandToChargeDescription = ({
	band,
	context,
}: {
	band: TierLineBand;
	context: LineItemContext;
}): string => {
	const tierLabel = bandToTierLabel({ band, context });

	if (band.kind === "flat_fee") {
		return tierLabel ? `${tierLabel} flat fee` : "flat fee";
	}

	const rate = formatAmount({
		currency: context.currency,
		amount: band.unitAmount,
		minFractionDigits: currencyInputDecimals(context.currency),
	});
	const billingUnits = context.price.config.billing_units ?? 1;
	const perPack =
		billingUnits > 1 ? ` per ${numberWithCommas(billingUnits)}` : "";
	const tierSuffix = tierLabel ? ` (${tierLabel})` : "";

	return `${numberWithCommas(band.quantity)} @ ${rate}${perPack}${tierSuffix}`;
};

/**
 * Describes one tier band as it is billed, e.g. "Pro · Messages — 150 @ $0.50 (volume tier 101–200)"
 * or "Pro · Messages — volume tier 101–200 flat fee".
 */
export const tierLineBandToDescription = ({
	band,
	context,
	includePeriodDescription = false,
}: {
	band: TierLineBand;
	context: LineItemContext;
	includePeriodDescription?: boolean;
}): string => {
	const { feature, product, price } = context;
	if (!feature) {
		throw new InternalError({
			message:
				"[tierLineBandToDescription] No feature found for line item context",
		});
	}

	const description = `${product.name} · ${feature.name} — ${bandToChargeDescription({ band, context })}`;

	const showsPeriod = includePeriodDescription && !isOneOffPrice(price);
	if (!showsPeriod) return description;

	return `${description} (${lineItemToPeriodDescription({ context })})`;
};
