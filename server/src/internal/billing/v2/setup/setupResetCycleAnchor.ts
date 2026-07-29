import {
	type FullCusProduct,
	type FullProduct,
	isCustomerProductFree,
	isCustomerProductOneOff,
	isFreeProduct,
	isOneOffProduct,
} from "@autumn/shared";

/**
 * Determine the billing cycle anchor based on product transitions.
 *
 * For future starts, feature resets anchor to the billing start (`startsAt`).
 */
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

	// Free -> Free: keep original anchor
	if (currentIsFree && newIsFree) {
		return customerProduct?.starts_at ?? "now";
	}

	const currentIsOneOff = isCustomerProductOneOff(customerProduct);
	const newIsOneOff = isOneOffProduct({ product: newFullProduct });

	// One-off -> One-off: keep original anchor
	if (currentIsOneOff && newIsOneOff) {
		return customerProduct?.starts_at ?? "now";
	}

	return billingCycleAnchorMs;
};
