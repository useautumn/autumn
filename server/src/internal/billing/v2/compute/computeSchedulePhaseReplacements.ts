import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";

export const computeSchedulePhaseReplacements = ({
	oldCustomerProduct,
	newCustomerProduct,
}: {
	oldCustomerProduct: FullCusProduct;
	newCustomerProduct: FullCusProduct;
}): AutumnBillingPlan["schedulePhaseCustomerProductReplacements"] => {
	if (oldCustomerProduct.status !== CusProductStatus.Scheduled) return undefined;

	return [
		{
			oldCustomerProductId: oldCustomerProduct.id,
			newCustomerProductId: newCustomerProduct.id,
			internalCustomerId: oldCustomerProduct.internal_customer_id,
			internalEntityId: oldCustomerProduct.internal_entity_id,
		},
	];
};
