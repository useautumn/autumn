import type { FullCustomer, FullProduct } from "@autumn/shared";
import { getScheduledMainCusProductByGroup } from "@autumn/shared";

// COMPUTES THE ACTIONS FOR THE SCHEDULED CUS PRODUCT, can be overridden by attach override
export const resolveScheduledCusProductAction = ({
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

	// 2. Get scheduled main cus product
	const scheduledMainCusProduct = getScheduledMainCusProductByGroup({
		fullCus,
		productGroup: product.group,
	});

	if (!scheduledMainCusProduct) return;

	// Get new product timing
	if (newProductTiming === "immediate") {
		return;
	}

	return {
		action: "delete" as const,
		cusProduct: scheduledMainCusProduct,
	};
};
