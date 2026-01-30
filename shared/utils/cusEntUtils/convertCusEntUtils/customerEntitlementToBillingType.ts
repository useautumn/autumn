import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { BillingType } from "@models/productModels/priceModels/priceEnums";
import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { getBillingType } from "@utils/productUtils/priceUtils";

export const customerEntitlementToBillingType = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}): BillingType | undefined => {
	const customerPrice = cusEntToCusPrice({ cusEnt });
	if (!customerPrice) return undefined;
	return getBillingType(customerPrice.price.config);
};
