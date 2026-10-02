import { generateKsuid } from "@autumn/ksuid";
import type {
	CustomLineItem,
	LineItem,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";

export const customLineItemsToLineItems = ({
	customLineItems,
	currency,
	stripeDiscounts = [],
}: {
	customLineItems: CustomLineItem[];
	currency: string;
	stripeDiscounts?: StripeDiscountWithCoupon[];
}): LineItem[] => {
	const lineItems = customLineItems.map((item) => ({
		id: generateKsuid({ prefix: "invoice_li_" }),
		amount: item.amount,
		amountAfterDiscounts: item.amount,
		description: item.description,
		discounts: [],
		chargeImmediately: true,
		prorated: false,
		context: {
			price: {} as LineItem["context"]["price"],
			product: { id: "", name: item.description } as LineItem["context"]["product"],
			currency,
			direction: item.amount >= 0 ? "charge" : "refund",
			now: Date.now(),
			billingTiming: "in_advance",
			discountable: false,
		},
	})) satisfies LineItem[];

	if (!stripeDiscounts.length) return lineItems;

	return applyStripeDiscountsToLineItems({
		lineItems,
		discounts: stripeDiscounts,
		options: { disableDiscountableForFreshDiscounts: true },
	});
};
