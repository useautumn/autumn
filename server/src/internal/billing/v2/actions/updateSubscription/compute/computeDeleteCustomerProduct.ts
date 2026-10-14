import {
	type FullCusProduct,
	isCustomerProductCanceling,
	isCustomerProductMain,
} from "@autumn/shared";
import type { FullCustomer } from "@shared/models/cusModels/fullCusModel";

export const computeDeleteCustomerProduct = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}): FullCusProduct | undefined => {
	const isMain = isCustomerProductMain(customerProduct);
	const isCanceling = isCustomerProductCanceling(customerProduct);

	if (!isMain || !isCanceling) return undefined;

	return undefined;
};
