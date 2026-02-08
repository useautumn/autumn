import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { Decimal } from "decimal.js";

export const priceToAllowanceInPacks = ({
	price,
	entitlement,
}: {
	price: Price;
	entitlement?: EntitlementWithFeature;
}) => {
	const allowanceInPacks = new Decimal(entitlement?.allowance ?? 0)
		.div(price.config.billing_units ?? 1)
		.toNumber();
	return allowanceInPacks;
};
