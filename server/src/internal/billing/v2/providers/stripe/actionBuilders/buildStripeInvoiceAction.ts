import {
	atmnToStripeAmount,
	type CustomLineItem,
	type LineItem,
	type LineItemDiscount,
	type StripeDiscountWithCoupon,
	type StripeInvoiceAction,
} from "@autumn/shared";

import { customLineItemsToLineItems } from "@/internal/billing/v2/utils/lineItems/customLineItemsToLineItems";
import { lineItemsToInvoiceAddLinesParams } from "../utils/invoiceLines/lineItemsToInvoiceAddLinesParams";

const discountsToMetadata = (
	discounts: LineItemDiscount[],
): { coupon_ids?: string } | undefined => {
	const couponIds = discounts
		.map((discount) => discount.stripeCouponId)
		.filter(Boolean)
		.join(",");

	return couponIds ? { coupon_ids: couponIds } : undefined;
};

/**
 * Builds a StripeInvoiceAction for immediate charges.
 * If customLineItems are provided, uses those directly (bypasses normal LineItem conversion).
 * Otherwise filters for line items where chargeImmediately === true.
 */
export const buildStripeInvoiceAction = ({
	lineItems,
	customLineItems,
	currency,
	stripeDiscounts,
}: {
	lineItems?: LineItem[];
	customLineItems?: CustomLineItem[];
	currency?: string;
	stripeDiscounts?: StripeDiscountWithCoupon[];
}): StripeInvoiceAction | undefined => {
	// Custom line items bypass the normal LineItem → Stripe conversion
	if (customLineItems?.length && currency) {
		const customLineItemsWithDiscounts = customLineItemsToLineItems({
			customLineItems,
			currency,
			stripeDiscounts,
		});
		const lines = customLineItemsWithDiscounts
			.filter((item) => item.amountAfterDiscounts !== 0)
			.map((item) => ({
				amount: atmnToStripeAmount({
					amount: item.amountAfterDiscounts,
					currency,
				}),
				description: item.description,
				discountable: false,
				metadata: discountsToMetadata(item.discounts),
			}));

		if (lines.length === 0) return undefined;

		return { addLineParams: { lines } };
	}

	if (!lineItems) {
		return undefined;
	}

	const immediateLineItems = lineItems.filter(
		(line) => line.chargeImmediately === true && line.amount !== 0,
	);

	if (immediateLineItems.length === 0) {
		return undefined;
	}

	const lines = lineItemsToInvoiceAddLinesParams({
		lineItems: immediateLineItems,
	});

	if (lines.length === 0) {
		return undefined;
	}

	return {
		addLineParams: { lines },
	};
};
