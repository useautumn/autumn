import { z } from "zod/v4";
import { CustomerDataSchema } from "../models.js";

// Cancel Schemas
export const CancelBodySchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
		example: "cus_123",
	}),
	product_id: z.string().meta({
		description: "The ID of the product to cancel",
		example: "pro_plan",
	}),
	entity_id: z.string().nullish().meta({
		description: "The ID of the entity (optional)",
		example: "entity_123",
	}),
	cancel_immediately: z.boolean().optional().meta({
		description: "Whether to cancel the product immediately or at period end",
		example: false,
	}),
	prorate: z.boolean().nullish().meta({
		description:
			"Whether to prorate the cancellation (defaults to true if not specified)",
		example: true,
	}),
});

export const CancelResultSchema = z.object({
	success: z.boolean().meta({
		description: "Whether the cancellation was successful",
		example: true,
	}),
	customer_id: z.string().meta({
		description: "The ID of the customer",
		example: "cus_123",
	}),
	product_id: z.string().meta({
		description: "The ID of the canceled product",
		example: "pro_plan",
	}),
});

// Query Schemas
export const QueryParamsSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer to query analytics for",
		example: "cus_123",
	}),
	feature_id: z.union([z.string(), z.array(z.string())]).meta({
		description: "The feature ID(s) to query",
		example: "api_calls",
	}),
	range: z
		.enum(["24h", "7d", "30d", "90d", "last_cycle"] as const)
		.nullish()
		.meta({
			description:
				"Time range for the query (defaults to last_cycle if not provided)",
			example: "7d",
		}),
});

export const QueryResultSchema = z.object({
	list: z.array(z.any()).meta({
		description: "List of usage data points",
		example: [{ period: 1717000000000, count: 100 }],
	}),
});

export const SetupPaymentParamsSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
	}),
	success_url: z.string().optional().meta({
		description:
			"URL to redirect to after successful payment setup. Must start with either http:// or https://",
	}),
	customer_data: CustomerDataSchema.optional(),
	checkout_session_params: z.record(z.string(), z.unknown()).optional().meta({
		description: "Additional parameters for the checkout session",
	}),
});

export const SetupPaymentResultSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
	}),
	url: z.string().meta({
		description: "URL to the payment setup page",
	}),
});

export const BillingPortalParamsSchema = z.object({
	return_url: z.string().optional().meta({
		description:
			"URL to redirect to when back button is clicked in the billing portal.",
	}),
});

export const BillingPortalResultSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
	}),
	url: z.string().meta({
		description: "URL to the billing portal",
	}),
});

export type CancelBody = z.infer<typeof CancelBodySchema>;
export type CancelResult = z.infer<typeof CancelResultSchema>;
export type QueryParams = z.infer<typeof QueryParamsSchema>;
export type QueryResult = z.infer<typeof QueryResultSchema>;
export type SetupPaymentParams = z.infer<typeof SetupPaymentParamsSchema>;
export type BillingPortalParams = z.infer<typeof BillingPortalParamsSchema>;
export type BillingPortalResult = z.infer<typeof BillingPortalResultSchema>;
