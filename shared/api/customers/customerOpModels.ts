import { CusExpand } from "@models/cusModels/cusExpand.js";
import { z } from "zod/v4";
import { EntityDataSchema } from "../common/entityData.js";
import { queryStringArray } from "../common/queryHelpers.js";

export const GetCustomerQuerySchema = z.object({
	expand: queryStringArray(z.enum(CusExpand)).optional(),
});

export const CreateCustomerQuerySchema = z.object({
	expand: queryStringArray(z.enum(CusExpand)).optional(),
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
		example: "cus_123",
	}),

	name: z.string().nullish().meta({
		description: "Customer's name",
		example: "John Doe",
	}),

	email: z.email({ message: "not a valid email address" }).nullish().meta({
		description: "Customer's email address",
		example: "john@example.com",
	}),

	fingerprint: z.string().optional().meta({
		description:
			"Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse",
		example: "fp_123abc",
	}),

	metadata: z
		.record(z.string(), z.any())
		.default({})
		.meta({
			description: "Additional metadata for the customer",
			example: { company: "Acme Inc" },
		}),

	stripe_id: z.string().optional().meta({
		description: "Stripe customer ID if you already have one",
		example: "cus_stripe123",
	}),

	entity_id: z.string().optional().meta({
		description: "Entity ID to associate with the customer",
		example: "entity_123",
	}),
	entity_data: EntityDataSchema.optional().meta({
		description: "Data for creating an entity",
	}),
});

// Update Customer Params (based on handleUpdateCustomer logic)
export const UpdateCustomerParamsSchema = z.object({
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
});

// List Customers Query (based on the docs)
export const ListCustomersQuerySchema = z.object({
	limit: z.number().int().min(10).max(100).default(10).optional().meta({
		description: "Maximum number of customers to return",
		example: 10,
	}),
	offset: z.number().int().min(0).default(0).optional().meta({
		description: "Number of customers to skip before returning results",
		example: 0,
	}),
});

// List Customers Response
export const ListCustomersResponseSchema = z.object({
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
});

export type CreateCustomerParams = z.infer<typeof CreateCustomerParamsSchema>;
export type UpdateCustomerParams = z.infer<typeof UpdateCustomerParamsSchema>;
export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;
export type ListCustomersResponse = z.infer<typeof ListCustomersResponseSchema>;
