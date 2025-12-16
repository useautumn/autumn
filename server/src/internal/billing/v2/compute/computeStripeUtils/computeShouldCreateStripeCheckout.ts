import {
	cusProductsToPrices,
	cusProductToPrices,
	type FullCusProduct,
	isFreeProduct,
} from "@autumn/shared";
import { notNullish } from "../../../../../utils/genUtils";
import type { AttachContext } from "../../types";

export const computeShouldCreateStripeCheckout = ({
	attachContext,
	newCusProducts,
}: {
	attachContext: AttachContext;
	newCusProducts: FullCusProduct[];
}) => {
	const { body } = attachContext;

	// 1. If force_checkout, create checkout
	if (body.force_checkout)
		return {
			shouldCreate: true,
			reason: "force_checkout",
		};

	// 2. If invoice is true, don't create checkout
	if (body.invoice)
		return {
			shouldCreate: false,
			reason: "invoice",
		};

	// 3. If has payment method, don't create checkout
	const hasPaymentMethod = notNullish(attachContext.paymentMethod);
	if (hasPaymentMethod)
		return {
			shouldCreate: false,
			reason: "has_payment_method",
		};

	// 4. If new cus products are free, don't create checkout
	const newPrices = cusProductsToPrices({ cusProducts: newCusProducts });
	const newIsFree = isFreeProduct({ prices: newPrices });
	if (newIsFree)
		return {
			shouldCreate: false,
			reason: "new products are free",
		};

	// 5. If there's an ongoing cus product and it's not free, don't create checkout (?)
	const ongoingCusProduct = attachContext.ongoingCusProductAction?.cusProduct;
	const ongoingPrices = ongoingCusProduct
		? cusProductToPrices({ cusProduct: ongoingCusProduct })
		: [];
	const ongoingIsFree = ongoingPrices
		? isFreeProduct({ prices: ongoingPrices })
		: false;

	if (ongoingCusProduct && !ongoingIsFree)
		return {
			shouldCreate: false,
			reason: "ongoing cus product is not free",
		};

	return {
		shouldCreate: true,
		reason: "passed all checks",
	};
};
