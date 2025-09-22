import { z } from "zod";
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
				if (val === null) return true; // Allow null/undefined

				return /^[a-zA-Z0-9_-]+$/.test(val);
			},
			(val) => {
				if (val === "") return { message: "can't be an empty string" };

				// Check for specific invalid characters and provide targeted messages
				if (val.includes("@")) {
					return {
						message:
							"ID cannot contain @ symbol. Use only letters, numbers, underscores, and hyphens.",
					};
				}
				if (val.includes(" ")) {
					return {
						message:
							"ID cannot contain spaces. Use only letters, numbers, underscores, and hyphens.",
					};
				}
				if (val.includes(".")) {
					return {
						message:
							"ID cannot contain periods. Use only letters, numbers, underscores, and hyphens.",
					};
				}
				if (/[^a-zA-Z0-9_-]/.test(val)) {
					const invalidChar = val.match(/[^a-zA-Z0-9_-]/)?.[0];
					return {
						message: `ID cannot contain '${invalidChar}'. Use only letters, numbers, underscores, and hyphens.`,
					};
				}

				return {
					message:
						"ID must contain only letters, numbers, underscores, and hyphens.",
				};
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
	metadata: z.record(z.any(), z.any()).nullish().default({}),
	stripe_id: z.string().nullish(),
});

export const CustomerResponseSchema = CustomerSchema.omit({
	// created_at: true,
	// env: true,
	// processor: true,
	org_id: true,
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerData = z.infer<typeof CustomerDataSchema>;
export type CustomerResponse = z.infer<typeof CustomerResponseSchema>;
export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;
