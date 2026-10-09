import {
	type SetPlansPreviewDiscount,
	type StripeDiscountWithCoupon,
	stripeDiscountToApiDiscount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { repeatingDiscountMonthsLeft } from "@/internal/billing/v2/setup/carryReplacedSubscription/repeatingDiscountMonthsLeft";

/** The current discounts as the preview lists them: a customer-level coupon has no subscription, a repeating one its carried months. */
export const previewSubscriptionDiscounts = ({
	discounts,
	customerDiscountId,
	subscription,
	currentEpochMs,
}: {
	discounts: StripeDiscountWithCoupon[];
	customerDiscountId: string | undefined;
	subscription: Stripe.Subscription | undefined;
	currentEpochMs: number;
}): SetPlansPreviewDiscount[] =>
	discounts.map((discount) => {
		// A replaced coupon's discount has no id, so only a real customer discount id can match.
		const isCustomerDiscount =
			customerDiscountId !== undefined && discount.id === customerDiscountId;
		const carriesMonths =
			!isCustomerDiscount &&
			subscription &&
			discount.source.coupon.duration === "repeating";
		return {
			...stripeDiscountToApiDiscount({
				discount,
				subscriptionId: isCustomerDiscount ? undefined : subscription?.id,
			}),
			months_left: carriesMonths
				? repeatingDiscountMonthsLeft({
						discount,
						subscription,
						currentEpochMs,
					})
				: null,
		};
	});
