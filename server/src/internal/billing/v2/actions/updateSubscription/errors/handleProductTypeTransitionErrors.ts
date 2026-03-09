import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import {
	cusProductToPrices,
	ErrCode,
	isFreeProduct,
	RecaseError,
} from "@autumn/shared";
import { isOneOff } from "@/internal/products/productUtils";

export const handleProductTypeTransitionErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (!newCustomerProduct) {
		return;
	}

	const currentCustomerProduct = billingContext.customerProduct;

	const currentPrices = cusProductToPrices({
		cusProduct: currentCustomerProduct,
	});
	const newPrices = cusProductToPrices({ cusProduct: newCustomerProduct });

	const currentIsFree = isFreeProduct({ prices: currentPrices });
	const newIsFree = isFreeProduct({ prices: newPrices });
	const currentIsOneOff = isOneOff(currentPrices);
	const newIsOneOff = isOneOff(newPrices);
	const currentIsPaidRecurring = !currentIsFree && !currentIsOneOff;
	const newIsPaidRecurring = !newIsFree && !newIsOneOff;

	if (currentIsPaidRecurring && newIsOneOff) {
		throw new RecaseError({
			message:
				"Cannot update a subscription from a recurring product to a one-off product",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (currentIsOneOff && newIsPaidRecurring) {
		throw new RecaseError({
			message:
				"Cannot update a subscription from a one-off product to a recurring product",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
