import type { AttachDiscount, StripeDiscountWithCoupon } from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type {
	StripeCustomerWithDiscount,
	StripeSubscriptionWithDiscounts,
} from "@/external/stripe/subscriptions";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveParamDiscounts } from "../utils/discounts/resolveParamDiscounts";
import { stripeCustomerToDiscounts } from "../utils/discounts/stripeCustomerToDiscounts";
import { subToDiscounts } from "../utils/discounts/subToDiscounts";

/**
 * Extracts discounts from already-fetched Stripe subscription or customer.
 * Subscription discounts take priority over customer discounts.
 *
 * Both subscription and customer discounts use the `source.coupon` structure
 * introduced in Stripe API version 2025-09-30.clover.
 *
 * @see https://docs.stripe.com/changelog/clover/2025-09-30/add-discount-source-property
 * @see https://docs.stripe.com/api/discounts/object
 */
export const extractStripeDiscounts = async ({
	ctx,
	stripeSubscription,
	stripeCustomer,
}: {
	ctx: AutumnContext;
	stripeSubscription?: StripeSubscriptionWithDiscounts;
	stripeCustomer?: StripeCustomerWithDiscount;
}): Promise<StripeDiscountWithCoupon[]> => {
	const subscriptionDiscounts = await subToDiscounts({
		ctx,
		sub: stripeSubscription,
	});

	if (subscriptionDiscounts.length > 0) {
		return subscriptionDiscounts;
	}

	return await stripeCustomerToDiscounts({ ctx, stripeCustomer });
};

/**
 * Filters out discounts whose underlying coupon was deleted from Stripe.
 * The deprecated rollover flow deletes coupons after applying them,
 * leaving orphaned discounts that break schedule phase creation.
 */
export const filterDeletedCouponDiscounts = async ({
	stripeCli,
	discounts,
}: {
	stripeCli: Stripe;
	discounts: StripeDiscountWithCoupon[];
}): Promise<StripeDiscountWithCoupon[]> => {
	if (discounts.length === 0) return discounts;

	const couponExists = await Promise.all(
		discounts.map(async (d) => {
			try {
				await stripeCli.coupons.retrieve(d.source.coupon.id);
				return true;
			} catch (error) {
				if (
					error instanceof Stripe.errors.StripeError &&
					error.code?.includes("resource_missing")
				)
					return false;
				throw error;
			}
		}),
	);

	return discounts.filter((_, i) => couponExists[i]);
};

/**
 * Fetches discounts for billing, combining existing Stripe discounts with optional param discounts.
 * Deduplicates by coupon ID — logs and skips param discounts already on the subscription.
 * Filters out discounts with deleted coupons.
 */
export const fetchStripeDiscountsForBilling = async ({
	ctx,
	stripeSubscription,
	stripeCustomer,
	paramDiscounts,
}: {
	ctx: AutumnContext;
	stripeSubscription?: StripeSubscriptionWithDiscounts;
	stripeCustomer?: StripeCustomerWithDiscount;
	paramDiscounts?: AttachDiscount[];
}): Promise<StripeDiscountWithCoupon[]> => {
	const existingDiscounts = await extractStripeDiscounts({
		ctx,
		stripeSubscription,
		stripeCustomer,
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	if (!paramDiscounts?.length) {
		return existingDiscounts;
		// return filterDeletedCouponDiscounts({
		// 	stripeCli,
		// 	discounts: existingDiscounts,
		// });
	}

	const resolvedParamDiscounts = await resolveParamDiscounts({
		stripeCli,
		discounts: paramDiscounts,
	});

	// Merge existing + param discounts, deduplicating by coupon ID.
	// When there's a conflict, prefer the discount that has a Stripe discount ID
	// (di_xxx) so stripeDiscountsToParams uses { discount: id } and preserves
	// the original start/end dates rather than creating a fresh one.
	const discountByCouponId = new Map<string, StripeDiscountWithCoupon>();

	for (const d of [...resolvedParamDiscounts, ...existingDiscounts]) {
		const couponId = d.source.coupon.id;
		const current = discountByCouponId.get(couponId);

		if (!current) {
			discountByCouponId.set(couponId, d);
		} else if (d.id && !current.id) {
			ctx.logger.warn(
				`[fetchStripeDiscountsForBilling] Preferring existing discount ${d.id} over param for coupon ${couponId}`,
			);
			discountByCouponId.set(couponId, d);
		} else if (!d.id && current.id) {
			ctx.logger.warn(
				`[fetchStripeDiscountsForBilling] Skipping duplicate param discount for coupon ${couponId} — already applied as ${current.id}`,
			);
		}
	}

	return [...discountByCouponId.values()];
};
