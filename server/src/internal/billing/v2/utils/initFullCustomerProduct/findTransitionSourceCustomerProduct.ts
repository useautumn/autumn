import {
	type FullCusProduct,
	type FullCustomer,
	findMainActiveCustomerProductByGroup,
} from "@autumn/shared";
import { cp } from "@utils/cusProductUtils/classifyCustomerProduct/cpBuilder";

export const PHASE_BOUNDARY_TOLERANCE_MS = 10 * 60 * 1000;

export const findTransitionSourceCustomerProduct = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}) => {
	const internalEntityId = customerProduct.internal_entity_id ?? undefined;
	const activeCustomerProduct = findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: customerProduct.product.group,
		internalEntityId,
	});
	if (activeCustomerProduct) return activeCustomerProduct;

	return fullCustomer.customer_products.find((candidate) => {
		const endedAt = candidate.ended_at;
		if (!endedAt) return false;
		if (
			Math.abs(endedAt - customerProduct.starts_at) >
			PHASE_BOUNDARY_TOLERANCE_MS
		) {
			return false;
		}

		return cp(candidate)
			.recurring()
			.main()
			.hasProductGroup({ productGroup: customerProduct.product.group })
			.onEntity({ internalEntityId }).valid;
	});
};
