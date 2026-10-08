import {
	type BillingContext,
	type SetPlansPreviewResponse,
	stripeDiscountToApiDiscount,
} from "@autumn/shared";
import type {
	StripeCustomerWithDiscount,
	StripeSubscriptionWithDiscounts,
} from "@/external/stripe/subscriptions";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { extractStripeDiscounts } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeDiscountsForBilling";
import { repeatingDiscountMonthsLeft } from "@/internal/billing/v2/setup/carryReplacedSubscription/repeatingDiscountMonthsLeft";

type CurrentSubscriptionTerms = Pick<
	SetPlansPreviewResponse,
	"discounts" | "invoice_mode"
>;

/** The current subscription's discounts and collection, read the way billing setup reads them, so the sheet prefills from what the server keeps. */
export const currentSubscriptionTerms = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: Pick<
		BillingContext,
		| "stripeSubscription"
		| "replacedStripeSubscription"
		| "stripeCustomer"
		| "currentEpochMs"
	>;
}): Promise<CurrentSubscriptionTerms> => {
	const currentSubscription =
		billingContext.stripeSubscription ??
		billingContext.replacedStripeSubscription;
	// Billing setup fetched both with their discounts expanded.
	const stripeCustomer = billingContext.stripeCustomer as
		| StripeCustomerWithDiscount
		| undefined;
	const discounts = await extractStripeDiscounts({
		ctx,
		stripeSubscription: currentSubscription as
			| StripeSubscriptionWithDiscounts
			| undefined,
		stripeCustomer,
	});
	const customerDiscountId = stripeCustomer?.discount?.id;
	const sendsInvoice =
		currentSubscription?.collection_method === "send_invoice";

	return {
		discounts: discounts.map((discount) => {
			const isCustomerDiscount = discount.id === customerDiscountId;
			const carriesMonths =
				!isCustomerDiscount &&
				currentSubscription &&
				discount.source.coupon.duration === "repeating";
			return {
				...stripeDiscountToApiDiscount({
					discount,
					// A customer-level coupon isn't on the subscription, matching the customer rewards list.
					subscriptionId: isCustomerDiscount
						? undefined
						: currentSubscription?.id,
				}),
				months_left: carriesMonths
					? repeatingDiscountMonthsLeft({
							discount,
							subscription: currentSubscription,
							currentEpochMs: billingContext.currentEpochMs,
						})
					: null,
			};
		}),
		invoice_mode: {
			enabled: sendsInvoice,
			...(sendsInvoice &&
				currentSubscription.days_until_due !== null && {
					net_terms_days: currentSubscription.days_until_due,
				}),
		},
	};
};
