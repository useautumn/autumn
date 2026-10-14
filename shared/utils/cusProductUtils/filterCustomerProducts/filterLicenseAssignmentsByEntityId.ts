import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { isCustomerProductLicenseAssignment } from "@utils/cusProductUtils/classifyCustomerProduct/classifyCustomerProduct";

export const filterLicenseAssignmentsByEntityId = ({
	customerProducts,
	internalEntityId,
	licensePlanId,
}: {
	customerProducts: FullCusProduct[];
	internalEntityId: string;
	licensePlanId?: string;
}) => {
	return customerProducts.filter(
		(customerProduct) =>
			isCustomerProductLicenseAssignment(customerProduct) &&
			customerProduct.internal_entity_id === internalEntityId &&
			(!licensePlanId || customerProduct.product.id === licensePlanId),
	);
};
