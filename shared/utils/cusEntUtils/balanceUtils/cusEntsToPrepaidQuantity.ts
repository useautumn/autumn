import { Decimal } from "decimal.js";
import { sumValues } from "../../../index.js";
import type {
	FullCusEntWithFullCusProduct,
	FullCusEntWithOptionalProduct,
} from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { cusProductToFeatureOptions } from "../../cusProductUtils/convertCusProduct/cusProductToFeatureOptions.js";
import { cusEntToCusPrice } from "../../productUtils/convertUtils.js";
import { isPrepaidPrice } from "../../productUtils/priceUtils.js";

export const cusEntToPrepaidQuantity = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct;
}) => {
	// 2. If cus ent is not prepaid, skip
	const cusPrice = cusEntToCusPrice({ cusEnt });

	if (!cusPrice || !isPrepaidPrice({ price: cusPrice.price })) return 0;

	// 3. Get quantity
	const options = cusEnt.customer_product?.options?.find(
		(option) =>
			option.internal_feature_id === cusEnt.entitlement.internal_feature_id,
	);

	if (!options) return 0;

	const quantityWithUnits = new Decimal(options.quantity)
		.mul(cusPrice.price.config.billing_units ?? 1)
		.toNumber();

	return quantityWithUnits;
};

export const cusEntsToPrepaidQuantity = ({
	cusEnts,
}: {
	cusEnts: (FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct)[];
}) => {
	return sumValues(
		cusEnts.map((cusEnt) => cusEntToPrepaidQuantity({ cusEnt })),
	);
};
