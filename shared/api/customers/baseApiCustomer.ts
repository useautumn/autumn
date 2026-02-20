import { AppEnv } from "@models/genModels/genEnums";
import { z } from "zod/v4";

export const BaseApiCustomerSchema = z.object({
	autumn_id: z.string().optional().meta({
		internal: true,
	}),
	id: z.string().nullable().meta({
		description: "Your unique identifier for the customer.",
	}),
	name: z.string().nullable().meta({
		description: "The name of the customer.",
	}),
	email: z.string().nullable().meta({
		description: "The email address of the customer.",
	}),
	created_at: z.number().meta({
		description: "Timestamp of customer creation in milliseconds since epoch.",
	}),
	fingerprint: z.string().nullable().meta({
		description:
			"A unique identifier (eg. serial number) to de-duplicate customers across devices or browsers. For example: apple device ID.",
	}),
	stripe_id: z.string().nullable().meta({
		description: "Stripe customer ID.",
	}),
	env: z.enum(AppEnv).meta({
		description: "The environment this customer was created in.",
	}),
	metadata: z.record(z.any(), z.any()).meta({
		description: "The metadata for the customer.",
	}),
	send_email_receipts: z.boolean().meta({
		description: "Whether to send email receipts to the customer.",
	}),
});

export type BaseApiCustomer = z.infer<typeof BaseApiCustomerSchema>;
