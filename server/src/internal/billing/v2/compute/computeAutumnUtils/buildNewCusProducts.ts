import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { cusProductToExistingUsages } from "../../../billingUtils/handleExistingUsages/cusProductToExistingUsages";
import { initFullCusProduct } from "../../../billingUtils/initFullCusProduct/initFullCusProduct";
import type { AttachContext } from "../../types";

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
	const newCusProduct = initFullCusProduct({
		ctx,
		fullCus,
		initContext: {
			fullCus,
			product: products[0],
			featureQuantities: [],
			replaceables: [],
			existingUsages,
		},
	});

	return [newCusProduct];
};
