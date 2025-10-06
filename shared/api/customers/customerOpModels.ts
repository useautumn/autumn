import { z } from "zod/v4";
import { EntityDataSchema } from "../common/entityData.js";

// Create Customer Params (based on handlePostCustomer logic)
export const CreateCustomerParamsSchema = z
	.object({
		id: z
			.string()
			.refine(
				(val) => {
					if (val === "") return false;
					if (val.includes("@")) return false;
					if (val.includes(" ")) return false;
					if (val.includes(".")) return false;
					return /^[a-zA-Z0-9_-]+$/.test(val);
				},
				{
					message:
						"ID can only contain letters, numbers, underscores, and hyphens",
				},
			)
			.nullish()
			.meta({
				description: "Your unique identifier for the customer",
				example: "cus_123",
			}),
		name: z.string().nullish().meta({
			description: "Customer's name",
			example: "John Doe",
		}),
		email: z
			.email({ message: "not a valid email address" })
			.or(z.literal(""))
			.nullish()
			.meta({
				description: "Customer's email address",
				example: "john@example.com",
			}),
		fingerprint: z.string().nullish().meta({
			description:
				"Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse",
			example: "fp_123abc",
		}),
		metadata: z
			.record(z.any(), z.any())
			.default({})
			.nullish()
			.meta({
				description: "Additional metadata for the customer",
				example: { company: "Acme Inc" },
			}),
		stripe_id: z.string().nullish().meta({
			description: "Stripe customer ID if you already have one",
			example: "cus_stripe123",
		}),
		entity_id: z.string().nullish().meta({
			description: "Entity ID to associate with the customer",
			example: "entity_123",
		}),
		entity_data: EntityDataSchema.nullish().meta({
			description: "Data for creating an entity",
		}),
	})
	.meta({
		id: "CreateCustomerParams",
		description: "Parameters for creating a customer",
	});

// Update Customer Params (based on handleUpdateCustomer logic)
export const UpdateCustomerParamsSchema = z
	.object({
		id: z
			.string()
			.refine(
				(val) => {
					if (val === "") return false;
					if (val.includes("@")) return false;
					if (val.includes(" ")) return false;
					if (val.includes(".")) return false;
					return /^[a-zA-Z0-9_-]+$/.test(val);
				},
				{
					message:
						"ID can only contain letters, numbers, underscores, and hyphens",
				},
			)
			.nullish()
			.meta({
				description:
					"New unique identifier for the customer (cannot be changed to null)",
				example: "cus_123",
			}),
		name: z.string().nullish().meta({
			description: "Customer's name",
			example: "John Doe",
		}),
		email: z
			.string()
			.email({ message: "not a valid email address" })
			.or(z.literal(""))
			.nullish()
			.meta({
				description: "Customer's email address",
				example: "john@example.com",
			}),
		fingerprint: z.string().nullish().meta({
			description:
				"Unique identifier (eg, serial number) to detect duplicate customers",
			example: "fp_123abc",
		}),
		metadata: z
			.record(z.any(), z.any())
			.nullish()
			.meta({
				description:
					"Additional metadata for the customer (set individual keys to null to delete them)",
				example: { company: "Acme Inc" },
			}),
		stripe_id: z.string().nullish().meta({
			description: "Stripe customer ID",
			example: "cus_stripe123",
		}),
	})
	.meta({
		id: "UpdateCustomerParams",
		description: "Parameters for updating a customer",
	});

// List Customers Query (based on the docs)
export const ListCustomersQuerySchema = z
	.object({
		limit: z.number().int().min(10).max(100).default(10).optional().meta({
			description: "Maximum number of customers to return",
			example: 10,
		}),
		offset: z.number().int().min(0).default(0).optional().meta({
			description: "Number of customers to skip before returning results",
			example: 0,
		}),
	})
	.meta({
		id: "ListCustomersQuery",
		description: "Query parameters for listing customers",
	});

// List Customers Response
export const ListCustomersResponseSchema = z
	.object({
		list: z.array(z.any()).meta({
			description: "List of customers",
		}),
		total: z.number().int().meta({
			description: "Total number of customers available",
			example: 100,
		}),
		limit: z.number().int().meta({
			description: "Maximum number of customers returned",
			example: 10,
		}),
		offset: z.number().int().meta({
			description: "Number of customers skipped before returning results",
			example: 0,
		}),
	})
	.meta({
		id: "ListCustomersResponse",
		description: "Response for listing customers",
	});

export type CreateCustomerParams = z.infer<typeof CreateCustomerParamsSchema>;
export type UpdateCustomerParams = z.infer<typeof UpdateCustomerParamsSchema>;
export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;
export type ListCustomersResponse = z.infer<typeof ListCustomersResponseSchema>;
