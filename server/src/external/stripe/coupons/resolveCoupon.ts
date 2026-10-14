import type { StripeDiscountWithCoupon } from "@autumn/shared";
import { RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

export const resolveCoupon = async ({
	stripeCli,
	couponId,
}: {
	stripeCli: Stripe;
	couponId: string;
}): Promise<StripeDiscountWithCoupon> => {
	try {
		const coupon = await stripeCli.coupons.retrieve(couponId, {
			expand: ["applies_to"],
		});

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
