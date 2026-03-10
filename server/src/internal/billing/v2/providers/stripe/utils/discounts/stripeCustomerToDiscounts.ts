import type { StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { StripeCustomerWithDiscount } from "@/external/stripe/subscriptions";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Extracts discount from a Stripe customer.
 *
 * When the discount has a deleted coupon, the new API's `source.coupon` only
 * returns `{ id, deleted: true }` with no percent_off / amount_off. To recover
 * the full coupon data we re-fetch the customer via the legacy Stripe API
 * (2025-02-24.acacia), which exposes the discount under `discount.coupon` with
 * all original fields intact even after deletion.
 */
export const stripeCustomerToDiscounts = async ({
	ctx,
	stripeCustomer,
}: {
	ctx: AutumnContext;
	stripeCustomer?: StripeCustomerWithDiscount;
}): Promise<StripeDiscountWithCoupon[]> => {
	const customerDiscount = stripeCustomer?.discount;
	if (!customerDiscount) return [];

	const coupon = customerDiscount.source?.coupon;
	if (!coupon || typeof coupon === "string") return [];

	if (!("deleted" in coupon) || !coupon.deleted) {
		return [customerDiscount as StripeDiscountWithCoupon];
	}

	// Coupon is deleted — re-fetch the customer via the legacy API which
	// exposes the discount under `discount.coupon` with all original fields intact.
	const legacyStripeCli = createStripeCli({
		org: ctx.org,
		env: ctx.env,
		legacyVersion: true,
	});

	const legacyCustomer = await legacyStripeCli.customers.retrieve(
		stripeCustomer.id,
		{ expand: ["discount.coupon"] },
	);

	if (legacyCustomer.deleted)
		return [customerDiscount as StripeDiscountWithCoupon];

	const legacyDiscount = legacyCustomer.discount;
	const fullCoupon = (legacyDiscount as unknown as { coupon?: Stripe.Coupon })
		?.coupon;

	if (!fullCoupon || typeof fullCoupon === "string") {
		return [customerDiscount as StripeDiscountWithCoupon];
	}

	return [
		{
			...customerDiscount,
			source: { ...customerDiscount.source, coupon: fullCoupon },
		} as StripeDiscountWithCoupon,
	];
};
