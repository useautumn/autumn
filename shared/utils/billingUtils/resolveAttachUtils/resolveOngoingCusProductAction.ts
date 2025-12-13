import type { FullCustomer } from "../../../models/cusModels/fullCusModel";
import type { FullProduct } from "../../../models/productModels/productModels";
import { getOngoingMainCusProductByGroup } from "../../cusProductUtils/getCusProductFromCustomer";

export const resolveOngoingCusProductAction = ({
	fullCus,
	product,
	newProductTiming,
}: {
	fullCus: FullCustomer;
	product: FullProduct;
	newProductTiming: "immediate" | "scheduled";
}) => {
	// 1. If it's an add on, return null
	if (product.is_add_on) return;

	// 2. Get current main cus product
	const ongoingMainCusProduct = getOngoingMainCusProductByGroup({
		fullCus,
		productGroup: product.group,
	});

	if (!ongoingMainCusProduct) return;

	if (newProductTiming === "immediate") {
		return {
			action: "expire" as const,
			cusProduct: ongoingMainCusProduct,
		};
	}

	return {
		action: "cancel" as const,
		cusProduct: ongoingMainCusProduct,
	};
};
