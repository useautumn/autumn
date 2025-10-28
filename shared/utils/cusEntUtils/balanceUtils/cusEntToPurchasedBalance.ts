import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { BillingType } from "../../../models/productModels/priceModels/priceEnums.js";
import {
	cusEntToCusPrice,
	entToOptions,
} from "../../productUtils/convertUtils.js";
import { getBillingType } from "../../productUtils/priceUtils.js";
import { nullish } from "../../utils.js";

export const cusEntToPurchasedBalance = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	// return 0;
	// 1. If prepaid
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (nullish(cusPrice)) return 0;

	const billingType = getBillingType(cusPrice.price.config);
	const billingUnits = cusPrice.price.config.billing_units || 1;

	if (billingType === BillingType.UsageInAdvance) {
		// Purchased balance is how much was prepaid
		const cusProduct = cusEnt.customer_product;
		const options = entToOptions({
			ent: cusEnt.entitlement,
			options: cusProduct.options,
		});

		const quantity = options?.quantity || 0;
		const quantityWithBillingUnits = new Decimal(quantity)
			.mul(billingUnits)
			.toNumber();

		return quantityWithBillingUnits;
	}

	// Return negative amount of balance...
	return -(cusEnt.balance || 0);
};
