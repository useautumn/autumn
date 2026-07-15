import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { isCustomerProductLicenseAssignment } from "@utils/cusProductUtils/classifyCustomerProduct/classifyCustomerProduct";

/** The entity's live license assignments, optionally scoped to one plan
 * (matched by the seat product's public id, stable across versions). */
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
