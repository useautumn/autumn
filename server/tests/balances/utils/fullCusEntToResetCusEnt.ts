import type {
	CusProduct,
	Customer,
	FullCustomerEntitlement,
	ResetCusEnt,
} from "@autumn/shared";

export const fullCusEntToResetCusEnt = ({
	fullCusEnt,
	customer,
	customerProduct,
}: {
	fullCusEnt: FullCustomerEntitlement;
	customer: Customer;
	customerProduct: CusProduct;
}): ResetCusEnt => {
	return {
		...fullCusEnt,
		customer,
		customer_product: customerProduct,
	};
};
