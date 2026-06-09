import type { ApiPlanItemV1 } from "@api/products/items/apiPlanItemV1";
import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCustomerPrice } from "@models/cusProductModels/cusPriceModels/cusPriceModels";
import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { mapToProductItems } from "@utils/productV2Utils/mapToProductV2";
import { productItemsToPlanItemsV1 } from "@utils/productV2Utils/productItemUtils/convertProductItem/productItemToPlanItemV1";
import { cusEntToCusPrice } from "./cusEntToCusPrice";

export const customerEntitlementToFeatureId = (
	customerEntitlement: FullCustomerEntitlement,
) => customerEntitlement.entitlement?.feature?.id ?? customerEntitlement.feature_id;

export const customerEntitlementToPlanItemV1 = ({
	customerEntitlement,
	customerProduct,
	customerPrices = [],
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	customerPrices?: FullCustomerPrice[];
}): ApiPlanItemV1 => {
	const effectiveCustomerProduct = {
		...customerProduct,
		customer_prices: [...customerProduct.customer_prices, ...customerPrices],
	};
	const customerPrice = cusEntToCusPrice({
		cusEnt: {
			...customerEntitlement,
			customer_product: effectiveCustomerProduct,
		},
		errorOnNotFound: false,
	});
	const features = [customerEntitlement.entitlement.feature];
	const items = mapToProductItems({
		entitlements: [customerEntitlement.entitlement],
		prices: customerPrice ? [customerPrice.price] : [],
		features,
	});

	return productItemsToPlanItemsV1({ items, features })[0];
};
