import type { BillingContext, StripeDiscountWithCoupon } from "@autumn/shared";
import type {
	StripeCustomerWithDiscount,
	StripeSubscriptionWithDiscounts,
} from "@/external/stripe/subscriptions";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { extractStripeDiscounts } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeDiscountsForBilling";

/**
 * The discounts the customer has before this request: the subscription it
 * changes or replaces, else the customer's own. Removals and additions aren't applied.
 */
export const setupCurrentStripeDiscounts = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}): Promise<StripeDiscountWithCoupon[]> =>
	// Setup fetched both with discounts expanded, as billing's own discount setup reads them.
	extractStripeDiscounts({
		ctx,
		stripeSubscription: (billingContext.stripeSubscription ??
			billingContext.replacedStripeSubscription) as
			| StripeSubscriptionWithDiscounts
			| undefined,
		stripeCustomer: billingContext.stripeCustomer as
			| StripeCustomerWithDiscount
			| undefined,
	});
