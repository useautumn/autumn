import { ExtPreviewLineItemSchema } from "@api/billing/common/billingPreviewResponse";
import { z } from "zod/v4";

export const ApiInvoicePreviewV0Schema = z.object({
	object: z.literal("invoice_preview").meta({ internal: true }),
	subscription_id: z.string().meta({
		description: "The Stripe subscription this invoice will be billed against.",
		example: "sub_1A2B3C4D5E6F7G8H",
	}),
	plan_ids: z.array(z.string()).meta({
		description: "Plan IDs contributing line items to this invoice.",
		example: ["pro", "starter"],
	}),
	invoice_at: z.number().meta({
		description:
			"Unix timestamp (milliseconds) when this invoice will be created.",
		example: 1788220800000,
	}),
	currency: z.string().meta({
		description: "The three-letter ISO currency code (e.g., 'usd').",
		example: "usd",
	}),
	subtotal: z.number().meta({
		description: "The total before discounts, in major currency units.",
		example: 15,
	}),
	total: z.number().meta({
		description: "The total after discounts, in major currency units.",
		example: 15,
	}),
	line_items: z.array(ExtPreviewLineItemSchema).meta({
		description:
			"The line items this invoice will contain: usage accrued in the closing cycle, plus recurring charges for the opening cycle.",
	}),
});

export type ApiInvoicePreviewV0 = z.infer<typeof ApiInvoicePreviewV0Schema>;
