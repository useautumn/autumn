import {
	BillingType,
	type FullProduct,
	type Price,
	priceToFeature,
	type UsagePriceConfig,
} from "@autumn/shared";
import { getBillingType } from "../../priceUtils.js";

export const usagePriceToProductName = ({
	price,
	fullProduct,
}: {
	price: Price;
	fullProduct: FullProduct;
}) => {
	const feature = priceToFeature({
		price,
		ents: fullProduct.entitlements,
	});

	if (!feature) {
		return fullProduct.name;
	}

	const billingType = getBillingType(price.config);
	const billingUnits = (price.config as UsagePriceConfig).billing_units;
	if (
		billingType == BillingType.UsageInAdvance &&
		billingUnits &&
		billingUnits > 1
	) {
		return `${fullProduct.name} - ${billingUnits} ${feature.name}`;
	}

	return `${fullProduct.name} - ${feature.name}`;
};
