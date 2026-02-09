import { type FullCusProduct, isPrepaidPrice } from "@autumn/shared";

/**
 * Convert cusProduct.options to feature_quantities with actual quantities
 * (multiplied by billingUnits for prepaid features)
 */
function cusProductToFeatureQuantities({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) {
	return cusProduct.options.map((option) => {
		const cusPrice = cusProduct.customer_prices.find((cp) => {
			const cusEnt = cusProduct.customer_entitlements.find(
				(ce) =>
					ce.internal_feature_id === option.internal_feature_id ||
					ce.entitlement.feature_id === option.feature_id,
			);
			return (
				cusEnt &&
				cp.price.config.internal_feature_id ===
					cusEnt.entitlement.internal_feature_id
			);
		});

		let quantity = option.quantity;

		if (cusPrice && isPrepaidPrice(cusPrice.price)) {
			const billingUnits = cusPrice.price.config.billing_units ?? 1;
			quantity = option.quantity * billingUnits;
		}

		return {
			feature_id: option.feature_id,
			quantity,
		};
	});
}
