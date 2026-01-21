import { CusExpand } from "@models/cusModels/cusExpand.js";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../common/customerData.js";
import { CustomerIdSchema } from "../common/customerId.js";
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

// Update Customer Params (based on handleUpdateCustomer logic)
export const UpdateCustomerParamsSchema = z
	.object({
		id: CustomerIdSchema.optional().meta({
			description: "New unique identifier for the customer",
		}),
	})
	.extend(CustomerDataSchema.shape);

// List Customers Query (based on the docs)
export const ListCustomersQuerySchema = z.object({
	limit: z.coerce.number().int().min(10).max(100).default(10).meta({
		description: "Maximum number of customers to return",
	}),
	offset: z.coerce.number().int().min(0).default(0).meta({
		description: "Number of customers to skip before returning results",
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

export type UpdateCustomerParams = z.infer<typeof UpdateCustomerParamsSchema>;
export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;

export type ListCustomersResponse = z.infer<typeof ListCustomersResponseSchema>;
export type GetBillingPortalQuery = z.infer<typeof GetBillingPortalQuerySchema>;
export type GetBillingPortalBody = z.infer<typeof GetBillingPortalBodySchema>;
export type GetBillingPortalResponse = z.infer<
	typeof GetBillingPortalResponseSchema
>;
