import { CusExpand } from "@models/cusModels/cusExpand.js";
import { z } from "zod/v4";
import { EntityDataSchema } from "../common/entityData.js";
import { queryStringArray } from "../common/queryHelpers.js";

export const GetCustomerQuerySchema = z.object({
	expand: queryStringArray(z.enum(CusExpand)).optional(),

	skip_cache: z.boolean().optional().meta({
		internal: true,
	}),
	with_autumn_id: z.boolean().default(false).meta({
		internal: true,
	}),
});

export const CreateCustomerQuerySchema = z.object({
	expand: queryStringArray(z.enum(CusExpand)).optional(),
	with_autumn_id: z.boolean().default(false).meta({
		internal: true,
	}),
});

const customerId = z.string().refine(
	(val) => {
		if (val === "") return false;
		if (val.includes("@")) return false;
		if (val.includes(" ")) return false;
		if (val.includes(".")) return false;
		return /^[a-zA-Z0-9_-]+$/.test(val);
	},
	{
		error: (issue) => {
			const input = issue.input as string;
			if (input === "") return { message: "can't be an empty string" };
			if (input.includes("@"))
				return {
					message:
						"cannot contain @ symbol. Use only letters, numbers, underscores, and hyphens.",
				};
			if (input.includes(" "))
				return {
					message:
						"cannot contain spaces. Use only letters, numbers, underscores, and hyphens.",
				};
			if (input.includes("."))
				return {
					message:
						"cannot contain periods. Use only letters, numbers, underscores, and hyphens.",
				};
			const invalidChar = input.match(/[^a-zA-Z0-9_-]/)?.[0];
			return {
				message: `cannot contain '${invalidChar}'. Use only letters, numbers, underscores, and hyphens.`,
			};
		},
	},
);

// Create Customer Params (based on handlePostCustomer logic)
export const CreateCustomerParamsSchema = z.object({
	id: customerId.nullable().meta({
		description: "Your unique identifier for the customer",
	}),

	name: z.string().nullish().meta({
		description: "Customer's name",
	}),

	email: z.email({ message: "not a valid email address" }).nullish().meta({
		description: "Customer's email address",
	}),

	fingerprint: z.string().optional().meta({
		description:
			"Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse",
	}),

	metadata: z.record(z.string(), z.any()).nullish().meta({
		description: "Additional metadata for the customer",
	}),

	stripe_id: z.string().optional().meta({
		description: "Stripe customer ID if you already have one",
	}),

	entity_id: z.string().optional().meta({
		internal: true,
	}),
	entity_data: EntityDataSchema.optional().meta({
		internal: true,
	}),
	disable_default: z.boolean().optional().meta({
		internal: true,
	}),
});

// Update Customer Params (based on handleUpdateCustomer logic)
export const UpdateCustomerParamsSchema = z.object({
	id: customerId.optional().meta({
		description: "New unique identifier for the customer.",
	}),
	name: z.string().nullish().meta({
		description: "The customer's name.",
	}),
	email: z.email({ message: "not a valid email address" }).nullish().meta({
		description: "Customer's email address",
	}),
	fingerprint: z.string().nullish().meta({
		description:
			"Unique identifier (eg, serial number) to detect duplicate customers.",
	}),
	metadata: z.record(z.any(), z.any()).nullish().meta({
		description:
			"Additional metadata for the customer (set individual keys to null to delete them).",
	}),
	stripe_id: z.string().nullish().meta({
		description: "Stripe customer ID.",
	}),
});

// List Customers Query (based on the docs)
export const ListCustomersQuerySchema = z.object({
	limit: z.coerce.number().int().min(10).max(100).default(10).optional().meta({
		description: "Maximum number of customers to return",
	}),
	offset: z.coerce.number().int().min(0).default(0).optional().meta({
		description: "Number of customers to skip before returning results",
	}),
	product_id: z.string().optional().meta({
		description:
			"Filter by product ID. Returns customers with active subscriptions to this product.",
	}),
});

// List Customers Response
export const ListCustomersResponseSchema = z.object({
	list: z.array(z.any()).meta({
		description: "List of customers",
	}),
	total: z.number().int().meta({
		description: "Total number of customers available",
	}),
	limit: z.number().int().meta({
		description: "Maximum number of customers returned",
	}),
	offset: z.number().int().meta({
		description: "Number of customers skipped before returning results",
	}),
});

// Get Billing Portal Query
export const GetBillingPortalQuerySchema = z.object({
	return_url: z.string().optional().meta({
		description:
			"URL to redirect to when back button is clicked in the billing portal",
	}),
});

// Get Billing Portal Body
export const GetBillingPortalBodySchema = z
	.object({
		configuration_id: z.string().optional().meta({
			description:
				"Stripe billing portal configuration ID. Create configurations in your Stripe dashboard.",
		}),
		return_url: z.string().optional().meta({
			description:
				"URL to redirect to when back button is clicked in the billing portal",
		}),
	})
	.optional();

// Get Billing Portal Response
export const GetBillingPortalResponseSchema = z.object({
	customer_id: z.string().nullable().meta({
		description: "The ID of the customer",
	}),
	url: z.string().meta({
		description: "URL to the billing portal",
	}),
});

export type CreateCustomerParams = z.infer<typeof CreateCustomerParamsSchema>;
export type UpdateCustomerParams = z.infer<typeof UpdateCustomerParamsSchema>;
export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;
export type ListCustomersResponse = z.infer<typeof ListCustomersResponseSchema>;
export type GetBillingPortalQuery = z.infer<typeof GetBillingPortalQuerySchema>;
export type GetBillingPortalBody = z.infer<typeof GetBillingPortalBodySchema>;
export type GetBillingPortalResponse = z.infer<
	typeof GetBillingPortalResponseSchema
>;
