import { CustomerSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** Columns only `customers.get` renders: absent on rows logged before it, and left out of the log's snapshot. */
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

/** The whole customers row: the columns commands decide on, and the rest `customers.get` renders. */
export const workerCustomerSchema = CustomerSchema.extend({
	// No defaults on stored columns: a default would leak into a change's `before`.
	metadata: z.record(z.any(), z.any()).nullish(),
	send_email_receipts: z.boolean(),
})
	.partial(customerRenderedColumns)
	.strict();

export type WorkerCustomer = z.infer<typeof workerCustomerSchema>;
