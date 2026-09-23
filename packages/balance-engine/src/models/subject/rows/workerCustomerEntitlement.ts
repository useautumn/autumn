import { CustomerEntitlementSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** Columns only `customers.get` renders: absent on rows logged before it, and left out of the log's snapshot. */
export const customerEntitlementRenderedColumns = {
	customer_id: true,
	feature_id: true,
	separate_interval: true,
	reset_by_invoice: true,
	pooled_contribution_id: true,
	metadata: true,
} as const;

/** The whole customer_entitlements row: the columns check and track read, and the rest `customers.get` renders. */
export const workerCustomerEntitlementSchema = CustomerEntitlementSchema.omit({
	// The Redis path's sync guard; nothing the worker decides or renders reads it.
	cache_version: true,
})
	// The table stores these NOT NULL; the shared schema allows null or fills defaults, and a default would leak into a change's `before`.
	.extend({
		balance: z.number(),
		adjustment: z.number(),
		additional_balance: z.number(),
		separate_interval: z.boolean(),
	})
	.partial(customerEntitlementRenderedColumns)
	.strict();

export type WorkerCustomerEntitlement = z.infer<
	typeof workerCustomerEntitlementSchema
>;
