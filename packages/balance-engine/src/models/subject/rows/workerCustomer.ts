import { CustomerSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

export const customerRenderedColumns = {
	org_id: true,
	env: true,
	created_at: true,
	name: true,
	email: true,
	fingerprint: true,
	processor: true,
	processors: true,
	metadata: true,
	send_email_receipts: true,
	currency: true,
	auto_topups: true,
} as const;

export const workerCustomerSchema = openSchema({
	name: "workerCustomer",
	schema: CustomerSchema.extend({
		metadata: z.record(z.any(), z.any()).nullish(),
		send_email_receipts: z.boolean(),
	}).partial(customerRenderedColumns),
});

export type WorkerCustomer = z.infer<typeof workerCustomerSchema>;
