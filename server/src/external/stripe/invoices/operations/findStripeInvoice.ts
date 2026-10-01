import type Stripe from "stripe";
import { isStripeResourceMissing } from "../../common/utils/isStripeResourceMissing.js";
import {
	type ExpandedStripeInvoice,
	getStripeInvoice,
} from "./getStripeInvoice.js";

type InvoiceExpand = Parameters<typeof getStripeInvoice>[0]["expand"];

/** `getStripeInvoice`, but undefined when Stripe has no such invoice; any other failure still throws. */
export const findStripeInvoice = async <T extends InvoiceExpand>({
	stripeClient,
	invoiceId,
	expand,
}: {
	stripeClient: Stripe;
	invoiceId: string;
	expand: T;
}): Promise<ExpandedStripeInvoice<T> | undefined> => {
	try {
		return await getStripeInvoice({ stripeClient, invoiceId, expand });
	} catch (error) {
		if (isStripeResourceMissing(error)) return undefined;
		throw error;
	}
};
