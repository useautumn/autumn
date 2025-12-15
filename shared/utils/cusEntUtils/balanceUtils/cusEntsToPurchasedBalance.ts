import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { BillingType } from "../../../models/productModels/priceModels/priceEnums.js";
import { cusEntToCusPrice } from "../../productUtils/convertUtils.js";
import { getBillingType } from "../../productUtils/priceUtils.js";
import { nullish, sumValues } from "../../utils.js";
import { getCusEntBalance } from "../balanceUtils.js";
import { cusEntToPrepaidQuantity } from "./cusEntToPrepaidQuantity.js";

export const cusEntsToPurchasedBalance = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}) => {
	// return 0;
	// 1. If prepaid
	const getPurchasedBalance = ({
		cusEnt,
		entityId,
	}: {
		cusEnt: FullCusEntWithFullCusProduct;
		entityId?: string;
	}) => {
		const cusPrice = cusEntToCusPrice({ cusEnt });
		if (nullish(cusPrice)) {
			const { balance } = getCusEntBalance({
				cusEnt,
				entityId,
			});

			return Math.max(0, -balance);
		}

		const billingType = getBillingType(cusPrice.price.config);

		if (billingType === BillingType.UsageInAdvance) {
			const prepaidQuantity = cusEntToPrepaidQuantity({ cusEnt });

			// Add negative cus ent balance too
			const { balance } = getCusEntBalance({
				cusEnt,
				entityId,
			});

			return prepaidQuantity + Math.max(0, -balance);
		}

		const { balance } = getCusEntBalance({
			cusEnt,
			entityId,
		});

		return Math.max(0, -balance);
	};

	return sumValues(
		cusEnts.map((cusEnt) => getPurchasedBalance({ cusEnt, entityId })),
	);
};

// // Purchased balance is how much was prepaid
// const cusProduct = cusEnt.customer_product;
// const options = entToOptions({
// 	ent: cusEnt.entitlement,
// 	options: cusProduct.options,
// });

// const quantity = options?.quantity || 0;
// const quantityWithBillingUnits = new Decimal(quantity)
// 	.mul(billingUnits)
// 	.toNumber();
