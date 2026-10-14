import type Stripe from "stripe";

export type StripeDiscountWithCoupon = {
	id?: string;
	start?: number;
	end?: number | null;
	source: { coupon: Stripe.Coupon };
	promotionCodeId?: string;
	firstTimeTransaction?: boolean;
	minimumAmount?: number | null;
	minimumAmountCurrency?: string | null;
	minimumAmountsByCurrency?: Record<string, number>;
};
