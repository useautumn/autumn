import {
	type LineItem,
	ms,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";

const discountWasActiveForCreditedPeriod = ({
	discount,
	lineItem,
}: {
	discount: StripeDiscountWithCoupon;
	lineItem: LineItem;
}): boolean => {
	const discountExistedOnSubscription = Boolean(discount.id);
	if (!discountExistedOnSubscription) {
		return false;
	}
	const creditedPeriodStart = lineItem.context.billingPeriod?.start;
	if (creditedPeriodStart === undefined) {
		return false;
	}
	const discountStartedAt = ms.seconds(discount.start ?? 0);
	if (discountStartedAt >= creditedPeriodStart) {
		return false;
	}
	const discountEndedAt =
		discount.end == null ? undefined : ms.seconds(discount.end);
	return discountEndedAt === undefined || discountEndedAt > creditedPeriodStart;
};

export const discountAppliesToLineItem = ({
	discount,
	lineItem,
}: {
	discount: StripeDiscountWithCoupon;
	lineItem: LineItem;
}): boolean => {
	const isProrationCredit = lineItem.context.direction === "refund";
	if (lineItem.amountAfterDiscountsFinalized) {
		return false;
	}
	if (
		isProrationCredit &&
		!discountWasActiveForCreditedPeriod({ discount, lineItem })
	) {
		return false;
	}

	const appliesToProducts = discount.source.coupon.applies_to?.products;

	if (!appliesToProducts || appliesToProducts.length === 0) {
		return true;
	}

	return lineItem.stripeProductId
		? appliesToProducts.includes(lineItem.stripeProductId)
		: false;
};
