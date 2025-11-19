import { z } from "zod/v4";

export const ApiInvoiceItemSchema = z.object({
	description: z.string().meta({
		description: "Description of the invoice line item",
		example: "Pro Plan - Monthly Subscription",
	}),
	period_start: z.number().meta({
		description: "Timestamp when the billing period starts",
		example: 1759247877000,
	}),
	period_end: z.number().meta({
		description: "Timestamp when the billing period ends",
		example: 1761839877000,
	}),

	feature_id: z.string().optional().meta({
		description: "The ID of the feature associated with this line item",
		example: "feature_123",
	}),
	feature_name: z.string().optional().meta({
		description: "The name of the feature associated with this line item",
		example: "API Calls",
	}),
});
