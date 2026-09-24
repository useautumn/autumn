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

	// Tax IDs first: an invalid VAT then fails before anything else is written.
	const taxIdChanges = billingDetails.tax_ids
		? await applyStripeTaxIdChanges({
				stripeCli,
				stripeCustomerId,
				taxIds: billingDetails.tax_ids,
			})
		: undefined;

	if (Object.keys(customerUpdate).length === 0) return;
	try {
		await stripeCli.customers.update(stripeCustomerId, customerUpdate);
	} catch (error) {
		await taxIdChanges?.undo();
		throw error;
	}
};
