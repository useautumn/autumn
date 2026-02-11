import type { AttachDiscount, StripeDiscountWithCoupon } from "@autumn/shared";
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
 * Fetches discounts for billing, combining existing Stripe discounts with optional param discounts.
 * Resolves param discounts via Stripe API and merges with existing subscription/customer discounts.
 * Deduplicates by coupon ID.
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

	if (!paramDiscounts?.length) {
		return existingDiscounts;
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const resolvedParamDiscounts = await resolveParamDiscounts({
		stripeCli,
		discounts: paramDiscounts,
	});

	// Merge with existing discounts, deduplicating by coupon ID
	const existingCouponIds = new Set(
		existingDiscounts.map((d) => d.source.coupon.id),
	);
	const newDiscounts = resolvedParamDiscounts.filter(
		(d) => !existingCouponIds.has(d.source.coupon.id),
	);

	return [...existingDiscounts, ...newDiscounts];
};