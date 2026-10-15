import type { Price } from "@autumn/shared";
import type Stripe from "stripe";

export type ItemSet = {
	subItems: (Stripe.SubscriptionUpdateParams.Item & {
		autumnPrice?: Price;
	})[];
	invoiceItems: Stripe.SubscriptionUpdateParams.AddInvoiceItem[];
	usageFeatures: string[];
};
