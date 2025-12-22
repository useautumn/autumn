import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { cusProductToExistingUsages } from "../../utils/handleExistingUsages/cusProductToExistingUsages";
import { initFullCustomerProduct } from "../../utils/initFullCustomerProduct/initFullCustomerProduct";
import type { AttachContext } from "../../typesOld";

export const buildNewCusProducts = ({
	ctx,
	attachContext,
}: {
	ctx: AutumnContext;
	attachContext: AttachContext;
}) => {
	const { fullCus, products, ongoingCusProductAction } = attachContext;

	const ongoingCusProduct = ongoingCusProductAction?.cusProduct;

	// Get existing usages
	const existingUsages = cusProductToExistingUsages({
		cusProduct: ongoingCusProduct,
		entityId: fullCus.entity?.id,
	});

	// Initialize new cus product
	const newCusProduct = initFullCustomerProduct({
		ctx,
		fullCus,
		initContext: {
			fullCustomer: fullCus,
			fullProduct: products[0],
			featureQuantities: [],
			existingUsages,
		},
	});

	return [newCusProduct];
};
