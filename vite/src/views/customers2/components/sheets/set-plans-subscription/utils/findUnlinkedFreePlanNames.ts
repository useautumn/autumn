import {
	type FullCusProduct,
	isCustomerProductUnlinkedFree,
} from "@autumn/shared";
import { isLiveCustomerProduct } from "./collectLinkedStripeObjectIds";

/** Free plans billed on no subscription, which every subscription's sheet includes. */
export const findUnlinkedFreePlanNames = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): string[] => [
	...new Set(
		customerProducts
			.filter(
				(customerProduct) =>
					isLiveCustomerProduct(customerProduct) &&
					isCustomerProductUnlinkedFree(customerProduct),
			)
			.map(
				(customerProduct) =>
					customerProduct.product?.name ?? customerProduct.product_id,
			),
	),
];
