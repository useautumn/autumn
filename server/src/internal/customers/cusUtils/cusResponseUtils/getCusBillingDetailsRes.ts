import { type Customer, CustomerExpand } from "@autumn/shared";
import { getStripeBillingDetails } from "@/external/stripe/customers/billingDetails/operations/getStripeBillingDetails.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const getCusBillingDetailsRes = async ({
	ctx,
	customer,
	expand,
}: {
	ctx: AutumnContext;
	customer: Customer;
	expand: CustomerExpand[];
}) => {
	if (!expand.includes(CustomerExpand.BillingDetails)) return undefined;

	const stripeCustomerId = customer.processor?.id;
	if (!stripeCustomerId) return null;

	return getStripeBillingDetails({ ctx, stripeCustomerId });
};
