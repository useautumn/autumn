import {
	BillingDetailsAddressSchema,
	BillingDetailsTaxIdSchema,
	TaxExemptSchema,
} from "@api/customers/components/billingDetails/billingDetails";
import { z } from "zod/v4";

export const BillingDetailsBillingParamsSchema = z
	.object({
		address: BillingDetailsAddressSchema.optional().meta({
			description:
				"Billing address saved to the customer and used to calculate tax. Replaces the customer's whole address.",
		}),
		tax_ids: z.array(BillingDetailsTaxIdSchema).optional().meta({
			description:
				"Tax IDs to add to the customer. IDs the customer already has are ignored, and existing IDs are never removed. To remove one, use customers.update or Stripe.",
		}),
		tax_exempt: TaxExemptSchema.optional().meta({
			description:
				"Customer tax exemption status. 'exempt' customers are never charged tax and need no address. 'reverse' applies reverse charge.",
		}),
	})
	.meta({
		title: "BillingDetailsBillingParams",
		description:
			"Billing details saved to the customer before billing runs. With preview, they are only used to calculate tax and nothing is saved.",
	});

export type BillingDetailsBillingParams = z.infer<
	typeof BillingDetailsBillingParamsSchema
>;
