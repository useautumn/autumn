import type { LineItem } from "../../../../models/billingModels/invoicingModels/lineItem";
import type { FullCustomerEntitlement } from "../../../../models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels";
import { cusPriceToCusEnt } from "../../../cusPriceUtils/convertCusPriceUtils";

/**
 * Finds the customer entitlement associated with a line item's price.
 */
export const lineItemToCustomerEntitlement = ({
	lineItem,
	customerProduct,
}: {
	lineItem: LineItem;
	customerProduct: FullCusProduct;
}): FullCustomerEntitlement | undefined => {
	const priceId = lineItem.context.price.id;

	const cusPrice = customerProduct.customer_prices.find(
		(cp) => cp.price.id === priceId,
	);

	if (!cusPrice) return undefined;

	return cusPriceToCusEnt({
		cusPrice,
		cusEnts: customerProduct.customer_entitlements,
	});
};
