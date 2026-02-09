import { RecaseError } from "@autumn/shared";
import type { StripeDiscountWithCoupon } from "@shared/models/billingModels/stripe/stripeDiscountWithCoupon";
import type Stripe from "stripe";

/**
 * Retrieves and validates a Stripe coupon by its ID.
 * Returns a StripeDiscountWithCoupon if valid, throws RecaseError if invalid or not found.
 */
export const resolveCoupon = async ({
	stripeCli,
	couponId,
}: {
	stripeCli: Stripe;
	couponId: string;
}): Promise<StripeDiscountWithCoupon> => {
	try {
		const coupon = await stripeCli.coupons.retrieve(couponId);

		if (!coupon.valid) {
			throw new RecaseError({
				message: `Coupon "${couponId}" is no longer valid`,
			});
		}

		return { source: { coupon } };
	} catch (error) {
		if (error instanceof RecaseError) throw error;

		throw new RecaseError({
			message: `Invalid coupon ID: "${couponId}"`,
		});
	}
};
