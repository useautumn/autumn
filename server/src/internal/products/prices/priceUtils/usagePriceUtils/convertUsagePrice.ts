import {
	BillingType,
	Feature,
	FullProduct,
	Price,
	UsagePriceConfig,
} from "@autumn/shared";
import { priceToFeature } from "../convertPrice.js";
import { getBillingType } from "../../priceUtils.js";

export const usagePriceToProductName = ({
	price,
	fullProduct,
}: {
	price: Price;
	fullProduct: FullProduct;
}) => {
	let feature = priceToFeature({
		price,
		ents: fullProduct.entitlements,
	});

	if (!feature) {
		return fullProduct.name;
	}

	let billingType = getBillingType(price.config);
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
