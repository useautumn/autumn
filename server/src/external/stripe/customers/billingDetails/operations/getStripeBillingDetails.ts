import type { ApiBillingDetails } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { stripeCustomerToBillingDetails } from "../utils/stripeCustomerToBillingDetails.js";
import { listStripeTaxIds } from "./listStripeTaxIds.js";

export const getStripeBillingDetails = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	stripeCustomerId: string;
}): Promise<ApiBillingDetails | null> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeCustomer = await stripeCli.customers.retrieve(stripeCustomerId);
	if (stripeCustomer.deleted) return null;

	const taxIds = await listStripeTaxIds({ stripeCli, stripeCustomerId });
	return stripeCustomerToBillingDetails({ stripeCustomer, taxIds });
};
