import {
	type BillingPreviewChange,
	type FullCusProduct,
	InternalError,
} from "@autumn/shared";

/** The plan row behind a preview change; a miss means facts would describe the wrong plan. */
export const findChangeCustomerProduct = ({
	change,
	customerProducts,
}: {
	change: BillingPreviewChange;
	customerProducts: FullCusProduct[];
}): FullCusProduct => {
	const customerProduct = customerProducts.find(
		({ product }) => product.id === change.plan_id,
	);
	if (!customerProduct) {
		throw new InternalError({
			message: `Approval facts: no billing plan row for preview plan ${change.plan_id}`,
		});
	}
	return customerProduct;
};
