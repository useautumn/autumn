import { z } from "zod/v4";
import { AppEnv } from "../genModels/genEnums.js";

export const CustomerSchema = z.object({
	id: z.string().nullish(), // given by user
	name: z.string().nullish(),
	email: z.string().nullish(),
	fingerprint: z.string().nullish(),

	// Internal
	internal_id: z.string(),
	org_id: z.string(),
	created_at: z.number(),
	env: z.nativeEnum(AppEnv),
	processor: z.any(),
	metadata: z.record(z.any(), z.any()).nullish().default({}),
});

export const CreateCustomerSchema = z.object({
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
				error: (issue) => {
					const input = issue.input as string;
					if (input === "") return { message: "can't be an empty string" };
					if (input.includes("@"))
						return {
							message:
								"ID cannot contain @ symbol. Use only letters, numbers, underscores, and hyphens.",
						};
					if (input.includes(" "))
						return {
							message:
								"ID cannot contain spaces. Use only letters, numbers, underscores, and hyphens.",
						};
					if (input.includes("."))
						return {
							message:
								"ID cannot contain periods. Use only letters, numbers, underscores, and hyphens.",
						};
					const invalidChar = input.match(/[^a-zA-Z0-9_-]/)?.[0];
					return {
						message: `ID cannot contain '${invalidChar}'. Use only letters, numbers, underscores, and hyphens.`,
					};
				},
			},
		)
		.nullish(),
	name: z.string().nullish(),
	email: z
		.string()
		.email({ message: "not a valid email address" })
		.or(z.literal(""))
		.nullish(),
	fingerprint: z.string().nullish(),
	metadata: z.record(z.any(), z.any()).default({}).nullish(),
	stripe_id: z.string().nullish(),
});

export const CustomerDataSchema = z.object({
	name: z.string().nullish(),
	email: z.string().nullish(),
	fingerprint: z.string().nullish(),
	metadata: z.record(z.any(), z.any()).nullish(),
	stripe_id: z.string().nullish(),
});

export const CustomerResponseSchema = CustomerSchema.omit({
	// created_at: true,
	// env: true,
	// processor: true,
	org_id: true,
});

export const CustomerSearchFiltersSchema = z.object({
  status: z.array(z.string()).optional(),
  version: z.array(z.string()).optional(),
  none: z.string().optional(),
  product_id: z.string().optional(),
}).optional().default({});

export const CustomerSearchInputSchema = z.object({
  search: z.string().default(""),
  page_size: z.number().int().min(1).max(1000).default(50),
  page: z.number().int().min(1).default(1),
  last_item: z.object({
    internal_id: z.string(),
    created_at: z.string().optional(),
    name: z.string().optional(),
  }).nullable().optional(),
  filters: CustomerSearchFiltersSchema,
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerData = z.infer<typeof CustomerDataSchema>;
export type CustomerResponse = z.infer<typeof CustomerResponseSchema>;
export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;
export type CustomerSearchInputSchema = z.infer<typeof CustomerSearchInputSchema>;
export type CustomerSearchFilters = z.infer<typeof CustomerSearchFiltersSchema>;
