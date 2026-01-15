import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import { BillingType } from "@models/productModels/priceModels/priceEnums";
import { getCusEntBalance } from "@utils/cusEntUtils/balanceUtils";
import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { entToOptions } from "@utils/productUtils/convertProductUtils";
import { getBillingType } from "@utils/productUtils/priceUtils";
import { nullish } from "@utils/utils";
import { Decimal } from "decimal.js";

export const cusEntToPurchasedBalance = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	entityId?: string;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });

	if (!cusEnt.customer_product) return 0;
	if (nullish(cusPrice)) {
		const { balance } = getCusEntBalance({
			cusEnt,
			entityId,
		});

		return Math.max(0, -balance);
	}

	const billingType = getBillingType(cusPrice.price.config);
	const billingUnits = cusPrice.price.config.billing_units || 1;

	if (billingType === BillingType.UsageInAdvance) {
		// Purchased balance is how much was prepaid
		const cusProduct = cusEnt.customer_product;
		const options = entToOptions({
			ent: cusEnt.entitlement,
			options: cusProduct?.options ?? [],
		});

		const quantity = options?.quantity || 0;
		const quantityWithBillingUnits = new Decimal(quantity)
			.mul(billingUnits)
			.toNumber();

		// Add negative cus ent balance too
		const { balance } = getCusEntBalance({
			cusEnt,
			entityId,
		});

		return quantityWithBillingUnits + Math.max(0, -balance);
	}

	const { balance } = getCusEntBalance({
		cusEnt,
		entityId,
	});

	return Math.max(0, -balance);
};
