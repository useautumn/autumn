import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig";
import type { UsagePriceConfig } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig";
import { BillingType } from "../../../models/productModels/priceModels/priceEnums";
import type { Price } from "../../../models/productModels/priceModels/priceModels";
import { calculateGraduatedTiersAmount } from "../../billingUtils/invoicingUtils/lineItemUtils/calculateGraduatedTiersAmount";
import { getBillingType } from "../priceUtils";

export const getPriceForOverage = ({
	price,
	overage,
}: {
	price: Price;
	overage?: number;
}) => {
	const usageConfig = price.config as UsagePriceConfig;
	const billingType = getBillingType(usageConfig);

	if (
		billingType === BillingType.FixedCycle ||
		billingType === BillingType.OneOff
	) {
		const config = price.config as FixedPriceConfig;
		return config.amount;
	}

	const billingUnits = usageConfig.billing_units || 1;

	return calculateGraduatedTiersAmount({
		tiers: usageConfig.usage_tiers,
		usage: overage!,
		billingUnits,
	});
};
