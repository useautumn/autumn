import type { StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";
import { assertFirstTimeStripeCustomer } from "@/external/stripe/customers";

/**
 * Rejects first-time-restricted promo codes for customers with prior payments.
 * No Stripe customer yet → necessarily first-time → skip.
 */
export const validateFirstTimeDiscounts = async ({
	stripeCli,
	discounts,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	discounts: StripeDiscountWithCoupon[];
	stripeCustomerId?: string;
}) => {
	const firstTimeDiscount = discounts.find(
		(discount) => discount.firstTimeTransaction,
	);

	if (!firstTimeDiscount) return;
	if (!stripeCustomerId) return;

	await assertFirstTimeStripeCustomer({
		stripeCli,
		stripeCustomerId,
		promoCode: firstTimeDiscount.promotionCode,
	});
};
