import { type FullCusProduct, isCustomerProductUnlinked } from "@autumn/shared";
import { isLiveCustomerProduct } from "./collectLinkedStripeObjectIds";

/** Plans billed on no subscription, which every subscription's sheet includes. */
export const findUnlinkedPlanNames = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): string[] => [
	...new Set(
		customerProducts
			.filter(
				(customerProduct) =>
					isLiveCustomerProduct(customerProduct) &&
					isCustomerProductUnlinked(customerProduct),
			)
			.map(
				(customerProduct) =>
					customerProduct.product?.name ?? customerProduct.product_id,
			),
	),
];
