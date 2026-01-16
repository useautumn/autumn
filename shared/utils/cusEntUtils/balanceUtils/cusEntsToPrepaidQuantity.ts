import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { Decimal } from "decimal.js";
import {
	type FullCusEntWithFullCusProduct,
	isEntityScopedCusEnt,
	isPrepaidPrice,
	sumValues,
} from "../../..";
import { cusProductToFeatureOptions } from "../../cusProductUtils/convertCusProduct/cusProductToFeatureOptions.js";

export const cusEntToPrepaidQuantity = ({
	cusEnt,
	sumAcrossEntities = false,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	sumAcrossEntities?: boolean;
}) => {
	// 2. If cus ent is not prepaid, skip
	const cusPrice = cusEntToCusPrice({ cusEnt });

	if (!cusPrice || !isPrepaidPrice(cusPrice.price)) return 0;

	if (!cusEnt.customer_product) return 0;

	// 3. Get quantity
	const options = cusProductToFeatureOptions({
		cusProduct: cusEnt.customer_product,
		feature: cusEnt.entitlement.feature,
	});

	if (!options) return 0;

	const quantityWithUnits = new Decimal(options.quantity)
		.mul(cusPrice.price.config.billing_units ?? 1)
		.toNumber();

	if (sumAcrossEntities && isEntityScopedCusEnt(cusEnt)) {
		return new Decimal(quantityWithUnits)
			.mul(Object.values(cusEnt.entities).length)
			.toNumber();
	}

	return quantityWithUnits;
};

export const cusEntsToPrepaidQuantity = ({
	cusEnts,
	sumAcrossEntities = false,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	sumAcrossEntities?: boolean;
}) => {
	return sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToPrepaidQuantity({ cusEnt, sumAcrossEntities }),
		),
	);
};
