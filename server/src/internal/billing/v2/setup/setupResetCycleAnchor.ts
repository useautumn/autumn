import {
	type FullCusProduct,
	type FullProduct,
	isCustomerProductFree,
	isCustomerProductOneOff,
	isFreeProduct,
	isOneOffProduct,
} from "@autumn/shared";

export const setupResetCycleAnchor = ({
	billingCycleAnchorMs,
	customerProduct,
	newFullProduct,
	billingStartsAt,
}: {
	billingCycleAnchorMs: number | "now";
	customerProduct?: FullCusProduct;
	newFullProduct: FullProduct;
	billingStartsAt?: number;
}): number | "now" => {
	const hasFutureBillingStart = billingStartsAt !== undefined;
	const shouldAnchorToBillingStart = hasFutureBillingStart && !customerProduct;

	if (shouldAnchorToBillingStart) {
		return billingStartsAt;
	}

	if (!customerProduct) {
		return billingCycleAnchorMs;
	}

	const currentIsFree = isCustomerProductFree(customerProduct);
	const newIsFree = isFreeProduct({ product: newFullProduct });

	if (currentIsFree && newIsFree) {
		return customerProduct?.starts_at ?? "now";
	}

	const currentIsOneOff = isCustomerProductOneOff(customerProduct);
	const newIsOneOff = isOneOffProduct({ product: newFullProduct });

	if (currentIsOneOff && newIsOneOff) {
		return customerProduct?.starts_at ?? "now";
	}

	return billingCycleAnchorMs;
};
