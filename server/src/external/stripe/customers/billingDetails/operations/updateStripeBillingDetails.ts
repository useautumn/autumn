import type { BillingDetailsParams } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingDetailsToStripeCustomerUpdate } from "../utils/billingDetailsToStripeCustomerUpdate.js";
import { applyStripeTaxIdChanges } from "./applyStripeTaxIdChanges.js";

export const updateStripeBillingDetails = async ({
	ctx,
	stripeCustomerId,
	billingDetails,
}: {
	ctx: AutumnContext;
	stripeCustomerId: string;
	billingDetails: BillingDetailsParams;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const customerUpdate = billingDetailsToStripeCustomerUpdate({
		billingDetails,
	});

	if (Object.keys(customerUpdate).length > 0) {
		await stripeCli.customers.update(stripeCustomerId, customerUpdate);
	}

	if (billingDetails.tax_ids) {
		await applyStripeTaxIdChanges({
			stripeCli,
			stripeCustomerId,
			taxIds: billingDetails.tax_ids,
		});
	}
};
