import {
	cusProductToPrices,
	type FullCustomer,
	type FullProduct,
	findMainActiveCustomerProductByGroup,
	findMainScheduledCustomerProductByGroup,
	isOneOffProduct,
	isProductUpgrade,
} from "@autumn/shared";
import type { PlanTiming } from "@autumn/shared";

/**
 * Sets up the transition context for attaching a product.
 * Determines if there's an existing product to transition from (upgrade/downgrade).
 */
export const setupAttachTransitionContext = ({
	fullCustomer,
	attachProduct,
}: {
	fullCustomer: FullCustomer;
	attachProduct: FullProduct;
}) => {
	// Only main recurring products can trigger transitions
	const isMainRecurring =
		!attachProduct.is_add_on &&
		!isOneOffProduct({ prices: attachProduct.prices });

	if (!isMainRecurring) {
		return {
			currentCustomerProduct: undefined,
			scheduledCustomerProduct: undefined,
			planTiming: "immediate" as PlanTiming,
		};
	}

	const currentCustomerProduct = findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: attachProduct.group,
	});

	const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
		fullCustomer,
		productGroup: attachProduct.group,
	});

	// Compute planTiming (upgrade = immediate, downgrade = end_of_cycle)
	let planTiming: PlanTiming = "immediate";

	if (currentCustomerProduct) {
		const currentPrices = cusProductToPrices({
			cusProduct: currentCustomerProduct,
		});

		const isUpgrade = isProductUpgrade({
			prices1: currentPrices,
			prices2: attachProduct.prices,
		});

		planTiming = isUpgrade ? "immediate" : "end_of_cycle";
	}

	return {
		currentCustomerProduct,
		scheduledCustomerProduct,
		planTiming,
	};
};
