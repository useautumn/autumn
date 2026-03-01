import type { AttachDiscount, StripeDiscountWithCoupon } from "@autumn/shared";
import { RecaseError } from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type {
	StripeCustomerWithDiscount,
	StripeSubscriptionWithDiscounts,
} from "@/external/stripe/subscriptions";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveParamDiscounts } from "../utils/discounts/resolveParamDiscounts";
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
export const extractStripeDiscounts = ({
	stripeSubscription,
	stripeCustomer,
}: {
	stripeSubscription?: StripeSubscriptionWithDiscounts;
	stripeCustomer: StripeCustomerWithDiscount;
}): StripeDiscountWithCoupon[] => {
	const subscriptionDiscounts = subToDiscounts({ sub: stripeSubscription });

	if (subscriptionDiscounts.length > 0) {
		return subscriptionDiscounts;
	}

	const customerDiscount = stripeCustomer.discount;
	if (!customerDiscount) return [];

	const coupon = customerDiscount.source?.coupon;
	if (!coupon || typeof coupon === "string") return [];

	// Customer discount already has source.coupon structure, return as-is
	return [customerDiscount as StripeDiscountWithCoupon];
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
 * Throws if any param discount coupon is already applied to the subscription (prevents double-use).
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
	stripeCustomer: StripeCustomerWithDiscount;
	paramDiscounts?: AttachDiscount[];
}): Promise<StripeDiscountWithCoupon[]> => {
	const existingDiscounts = extractStripeDiscounts({
		stripeSubscription,
		stripeCustomer,
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	if (!paramDiscounts?.length) {
		return filterDeletedCouponDiscounts({
			stripeCli,
			discounts: existingDiscounts,
		});
	}

	const resolvedParamDiscounts = await resolveParamDiscounts({
		stripeCli,
		discounts: paramDiscounts,
	});

	// Reject if any param discount coupon is already applied to the subscription
	const existingCouponIds = new Set(
		existingDiscounts.map((d) => d.source.coupon.id),
	);
	for (const d of resolvedParamDiscounts) {
		if (existingCouponIds.has(d.source.coupon.id)) {
			throw new RecaseError({
				message: `Discount ${d.source.coupon.id} is already applied to this subscription`,
				code: "",
				statusCode: 400,
			});
		}
	}

	const allDiscounts = [...existingDiscounts, ...resolvedParamDiscounts];
	return filterDeletedCouponDiscounts({ stripeCli, discounts: allDiscounts });
};
