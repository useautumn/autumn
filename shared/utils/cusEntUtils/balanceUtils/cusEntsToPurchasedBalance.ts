import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { BillingType } from "../../../models/productModels/priceModels/priceEnums.js";
import { getBillingType } from "../../productUtils/priceUtils.js";
import { nullish, sumValues } from "../../utils.js";
import { getCusEntBalance } from "../balanceUtils.js";
import { cusEntToCusPrice } from "../convertCusEntUtils/cusEntToCusPrice.js";
import { cusEntsToPrepaidQuantity } from "./cusEntsToPrepaidQuantity.js";

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
			const prepaidQuantity = cusEntsToPrepaidQuantity({ cusEnts: [cusEnt] });

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
