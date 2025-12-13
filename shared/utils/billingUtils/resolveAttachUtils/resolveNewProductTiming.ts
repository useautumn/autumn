import type { FullCustomer } from "../../../models/cusModels/fullCusModel";
import type { FullProduct } from "../../../models/productModels/productModels";
import { cusProductToPrices } from "../../cusProductUtils/convertCusProduct";
import { getOngoingMainCusProductByGroup } from "../../cusProductUtils/getCusProductFromCustomer";
import { isProductUpgrade } from "../../productUtils/isProductUpgrade";

export const resolveNewProductTiming = ({
	fullCus,
	product,
}: {
	fullCus: FullCustomer;
	product: FullProduct;
}): "immediate" | "scheduled" => {
	// 1. If product is an add on, return immediate
	if (product.is_add_on) return "immediate";

	// 2. Get current main cus product
	const ongoingCusProduct = getOngoingMainCusProductByGroup({
		fullCus,
		productGroup: product.group,
	});

	// 3. If no current main cus product, return immediate
	if (!ongoingCusProduct) return "immediate";

	// 4. If current main cus product is same as new product return immediate:
	const isSameProduct = ongoingCusProduct.product.id === product.id;
	if (isSameProduct) return "immediate";

	// 4. If current cus product is different from new product:
	const curPrices = cusProductToPrices({ cusProduct: ongoingCusProduct });
	const isUpgrade = isProductUpgrade({
		prices1: curPrices,
		prices2: product.prices,
	});

	if (isUpgrade) return "immediate";

	return "scheduled";
};
