import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { isPrepaidPrice } from "../../productUtils/priceUtils/classifyPriceUtils.js";
import { cusEntToCusPrice } from "../convertCusEntUtils/cusEntToCusPrice.js";

export const cusEntToPrepaidQuantity = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	// 2. If cus ent is not prepaid, skip
	const cusPrice = cusEntToCusPrice({ cusEnt });

	if (!cusPrice || !isPrepaidPrice(cusPrice.price)) return 0;

	// 3. Get quantity
	const options = cusEnt.customer_product.options.find(
		(option) =>
			option.internal_feature_id === cusEnt.entitlement.internal_feature_id,
	);

	if (!options) return 0;

	const quantityWithUnits = new Decimal(options.quantity)
		.mul(cusPrice.price.config.billing_units ?? 1)
		.toNumber();

	return quantityWithUnits;
};
