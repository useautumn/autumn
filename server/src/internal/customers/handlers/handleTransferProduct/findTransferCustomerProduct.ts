import {
	type Entity,
	type FullCustomer,
	isCustomerProductScheduled,
} from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";

/** Without an explicit id, the active row wins over scheduled ones of the same plan. */
export const findTransferCustomerProduct = ({
	fullCustomer,
	fromEntity,
	productId,
	customerProductId,
}: {
	fullCustomer: FullCustomer;
	fromEntity: Entity | null;
	productId: string;
	customerProductId?: string | null;
}) => {
	const candidates = fullCustomer.customer_products.filter(
		(customerProduct) =>
			(!customerProductId || customerProduct.id === customerProductId) &&
			customerProduct.product.id === productId &&
			(fromEntity
				? customerProduct.internal_entity_id === fromEntity.internal_id
				: nullish(customerProduct.internal_entity_id)),
	);

	return (
		candidates.find(
			(customerProduct) => !isCustomerProductScheduled(customerProduct),
		) ?? candidates[0]
	);
};
