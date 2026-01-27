import { z } from "zod/v4";
import { AppEnv } from "../genModels/genEnums.js";
import { ExternalProcessorsSchema } from "../genModels/processorSchemas.js";

export const CustomerSchema = z.object({
	id: z.string().nullish(), // given by user
	name: z.string().nullish(),
	email: z.string().nullish(),
	fingerprint: z.string().nullish(),

	// Internal
	internal_id: z.string(),
	org_id: z.string(),
	created_at: z.number(),
	env: z.enum(AppEnv),
	processor: z.any(),
	processors: ExternalProcessorsSchema.nullish(),
	metadata: z.record(z.any(), z.any()).nullish().default({}),
	send_email_receipts: z.boolean().default(false),
});

export type Customer = z.infer<typeof CustomerSchema>;

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
	processors: ExternalProcessorsSchema.nullish(),
	send_email_receipts: z.boolean().default(false),
});

export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;
