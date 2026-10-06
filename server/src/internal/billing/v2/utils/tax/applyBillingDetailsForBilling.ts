import type { BillingContext } from "@autumn/shared";
import { updateStripeBillingDetails } from "@/external/stripe/customers/billingDetails/operations/updateStripeBillingDetails";
import { assertBillingDetailsWritable } from "@/external/stripe/customers/billingDetails/utils/assertBillingDetailsWritable";
import { getExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Writes request billing details to the Stripe customer, returning the refreshed customer so tax sees the new location. */
export const applyBillingDetailsForBilling = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}) => {
	const { billingDetails, stripeCustomer } = billingContext;
	if (!billingDetails || !stripeCustomer) return stripeCustomer;

	assertBillingDetailsWritable({ ctx });
	await updateStripeBillingDetails({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		billingDetails: {
			address: billingDetails.address,
			tax_ids: billingDetails.tax_ids
				? { add: billingDetails.tax_ids }
				: undefined,
			tax_exempt: billingDetails.tax_exempt,
		},
	});

	return getExpandedStripeCustomer({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		errorOnNotFound: true,
		expandTax: true,
	});
};
