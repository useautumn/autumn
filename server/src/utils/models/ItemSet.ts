import type { Price } from "@autumn/shared";
import type Stripe from "stripe";

// export const ItemSetSchema = z.object({
//   items: z.array(z.any()),
//   prices: z.array(z.any()),
//   interval: z.nativeEnum(BillingInterval),
//   intervalCount: z.number(),
//   subMeta: z.record(z.string(), z.any()),
//   usageFeatures: z.array(z.string()),
// });

// export type ItemSet = z.infer<typeof ItemSetSchema>;

export type ItemSet = {
	subItems: (Stripe.SubscriptionUpdateParams.Item & {
		autumnPrice?: Price;
	})[];
	invoiceItems: Stripe.SubscriptionUpdateParams.AddInvoiceItem[];
	usageFeatures: string[];
};

// export const ItemSetSchema2 = z.object({
//   subItems: z.array(z.any()),
//   invoiceItems: z.array(z.any()),
//   usageFeatures: z.array(z.any()),
// });

// export type ItemSet2 = z.infer<typeof ItemSetSchema2>;
