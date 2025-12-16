import type { LineItem } from "../../../models/billingModels/invoicingModels/lineItem";
import type { LineItemContext } from "../../../models/billingModels/invoicingModels/lineItemContext";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels";
import type { Organization } from "../../../models/orgModels/orgTable";
import { cusPriceToCusEntWithCusProduct } from "../../cusPriceUtils/convertCusPriceUtils";
import { orgToCurrency } from "../../orgUtils/convertOrgUtils";
import { isConsumablePrice } from "../../productUtils/priceUtils/classifyPriceUtils";
import { getLineItemBillingPeriod } from "../cycleUtils/getLineItemBillingPeriod";
import { usagePriceToLineItem } from "./lineItemBuilders/usagePriceToLineItem";

export const cusProductToArrearLineItems = ({
	cusProduct,
	billingCycleAnchor,
	now,
	org,
}: {
	cusProduct: FullCusProduct;
	billingCycleAnchor: number;
	now: number;
	org: Organization;
}) => {
	let lineItems: LineItem[] = [];

	for (const cusPrice of cusProduct.customer_prices) {
		const price = cusPrice.price;

		if (!isConsumablePrice(price)) continue;

		// Calculate billing period
		const billingPeriod = getLineItemBillingPeriod({
			anchor: billingCycleAnchor,
			price,
			now,
		});

		const cusEnt = cusPriceToCusEntWithCusProduct({
			cusProduct,
			cusPrice,
			cusEnts: cusProduct.customer_entitlements,
		});

		if (!cusEnt) {
			throw new Error(
				`[cusProductToConsumableLineItems] No cusEnt found for cusPrice: ${cusPrice.id}`,
			);
		}

		const context: LineItemContext = {
			price,
			product: cusProduct.product,
			feature: cusEnt.entitlement.feature,

			billingPeriod,
			direction: "charge",
			billingTiming: "in_arrear",
			now,
			currency: orgToCurrency({ org }),
		};

		lineItems.push(usagePriceToLineItem({ cusEnt, context }));
	}

	lineItems = lineItems.filter((item) => item.amount !== 0);

	return lineItems;
};
