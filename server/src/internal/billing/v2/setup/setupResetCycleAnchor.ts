import {
	cusProductToProduct,
	type FullCusProduct,
	type FullProduct,
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

	const currentFullProduct = cusProductToProduct({
		cusProduct: customerProduct,
	});

	const currentIsFree = isFreeProduct({ prices: currentFullProduct.prices });
	const newIsFree = isFreeProduct({ prices: newFullProduct.prices });

	// Free -> Free: keep original anchor
	if (currentIsFree && newIsFree) {
		return customerProduct?.starts_at ?? "now";
	}

	const currentIsOneOff = isOneOffProduct({
		prices: currentFullProduct.prices,
	});
	const newIsOneOff = isOneOffProduct({ prices: newFullProduct.prices });

	// One-off -> One-off: keep original anchor
	if (currentIsOneOff && newIsOneOff) {
		return customerProduct?.starts_at ?? "now";
	}

	return billingCycleAnchorMs;
};
