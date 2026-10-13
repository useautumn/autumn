import {
	BillingType,
	cusProductToPrices,
	type FullCusProduct,
} from "@autumn/shared";

/** Purchased prepaid units, priced by the customer's own version so a later catalog pack size can't rescale them. */
export function customerProductToPaidFeatureQuantities({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}): Record<string, number> {
	const prepaidPrices = cusProductToPrices({
		cusProduct,
		billingType: BillingType.UsageInAdvance,
	});

	return Object.fromEntries(
		(cusProduct.options ?? []).flatMap((option) => {
			const price = prepaidPrices.find(({ config }) =>
				option.internal_feature_id
					? "internal_feature_id" in config &&
						config.internal_feature_id === option.internal_feature_id
					: "feature_id" in config && config.feature_id === option.feature_id,
			);
			if (!price || option.quantity <= 0) return [];
			const billingUnits =
				("billing_units" in price.config && price.config.billing_units) || 1;
			return [[option.feature_id, option.quantity * billingUnits]];
		}),
	);
}

/** Purchased seats per license plan, excluding the seats the license includes. */
export function customerProductToPaidLicenseQuantities({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}): Record<string, number> {
	return Object.fromEntries(
		(cusProduct.customer_licenses ?? []).flatMap(
			({ planLicense, paid_quantity }) =>
				planLicense && paid_quantity > 0
					? [[planLicense.product.id, paid_quantity]]
					: [],
		),
	);
}
