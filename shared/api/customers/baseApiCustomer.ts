import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";

export const BaseApiCustomerSchema = z.object({
	autumn_id: z.string().optional().meta({
		internal: true,
	}),
	id: z.string().nullable(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	created_at: z.number(),
	fingerprint: z.string().nullable(),
	stripe_id: z.string().nullable(),
	env: z.enum(AppEnv),
	metadata: z.record(z.any(), z.any()),
	send_email_receipts: z.boolean(),
});

export type BaseApiCustomer = z.infer<typeof BaseApiCustomerSchema>;
