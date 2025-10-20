import { z } from "zod/v4";
import { CustomerDataSchema } from "../common/customerData.js";
import { EntityDataSchema } from "../common/entityData.js";

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

// Track Schemas
export const TrackParamsSchema = z.object({
	customer_id: z.string().nonempty().meta({
		description: "The ID of the customer",
		example: "cus_123",
	}),
	customer_data: CustomerDataSchema.nullish().meta({
		description:
			"Customer data to create or update the customer if they don't exist",
	}),
	event_name: z.string().nonempty().optional().meta({
		description: "The name of the event to track",
		example: "api_call",
	}),
	feature_id: z.string().optional().meta({
		description:
			"The ID of the feature (alternative to event_name for usage events)",
		example: "api_calls",
	}),
	properties: z
		.record(z.string(), z.any())
		.nullish()
		.meta({
			description: "Additional properties for the event",
			example: { endpoint: "/api/users" },
		}),
	timestamp: z.number().nullish().meta({
		description: "Unix timestamp in milliseconds when the event occurred",
		example: 1717000000000,
	}),
	idempotency_key: z.string().nullish().meta({
		description: "Idempotency key to prevent duplicate events",
		example: "evt_abc123",
	}),
	value: z.number().nullish().meta({
		description: "The value/count of the event",
		example: 1,
	}),
	set_usage: z.boolean().nullish().meta({
		description: "Whether to set the usage to this value instead of increment",
		example: false,
	}),
	entity_id: z.string().nullish().meta({
		description: "The ID of the entity this event is associated with",
		example: "entity_123",
	}),
	entity_data: EntityDataSchema.nullish().meta({
		description: "Data for creating the entity if it doesn't exist",
	}),
});

export const TrackResultSchema = z.object({
	id: z.string().meta({
		description: "The ID of the created event",
		example: "evt_123",
	}),
	code: z.string().meta({
		description: "Response code",
		example: "event_received",
	}),
	customer_id: z.string().meta({
		description: "The ID of the customer",
		example: "cus_123",
	}),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity (if provided)",
		example: "entity_123",
	}),
	event_name: z.string().optional().meta({
		description: "The name of the event",
		example: "api_call",
	}),
	feature_id: z.string().optional().meta({
		description: "The ID of the feature (if provided)",
		example: "api_calls",
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
		example: "cus_123",
	}),
	success_url: z.string().optional().meta({
		description: "URL to redirect to after successful payment setup",
		example: "https://example.com/success",
	}),
	checkout_session_params: z.record(z.string(), z.unknown()).optional().meta({
		description: "Additional parameters for the checkout session",
	}),
});

export const SetupPaymentResultSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
		example: "cus_123",
	}),
	url: z.string().meta({
		description: "URL to the payment setup page",
		example: "https://checkout.stripe.com/...",
	}),
});

export const BillingPortalParamsSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
		example: "cus_123",
	}),
	return_url: z.string().optional().meta({
		description:
			"Time range for the query (defaults to last_cycle if not provided)",
		example: "7d",
	}),
});

export const BillingPortalResultSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
		example: "cus_123",
	}),
	url: z.string().meta({
		description: "URL to the billing portal",
		example: "https://billing.stripe.com/...",
	}),
});

export type CancelBody = z.infer<typeof CancelBodySchema>;
export type CancelResult = z.infer<typeof CancelResultSchema>;
export type TrackParams = z.infer<typeof TrackParamsSchema>;
export type TrackResult = z.infer<typeof TrackResultSchema>;
export type QueryParams = z.infer<typeof QueryParamsSchema>;
export type QueryResult = z.infer<typeof QueryResultSchema>;
export type SetupPaymentParams = z.infer<typeof SetupPaymentParamsSchema>;
export type BillingPortalParams = z.infer<typeof BillingPortalParamsSchema>;
export type BillingPortalResult = z.infer<typeof BillingPortalResultSchema>;
