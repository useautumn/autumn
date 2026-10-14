import { CustomerEntitlementSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

export const customerEntitlementRenderedColumns = {
	customer_id: true,
	feature_id: true,
	separate_interval: true,
	reset_by_invoice: true,
	pooled_contribution_id: true,
	metadata: true,
} as const;

export const workerCustomerEntitlementSchema = openSchema({
	name: "workerCustomerEntitlement",
	schema: CustomerEntitlementSchema.omit({
		cache_version: true,
	})
		.extend({
			balance: z.number(),
			adjustment: z.number(),
			additional_balance: z.number(),
			separate_interval: z.boolean(),
		})
		.partial(customerEntitlementRenderedColumns),
});

export type WorkerCustomerEntitlement = z.infer<
	typeof workerCustomerEntitlementSchema
>;
