import { CustomerEntitlementSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** The customer_entitlements columns check and track read; picked from the shared row schema. */
export const workerCustomerEntitlementSchema = CustomerEntitlementSchema.pick({
	id: true,
	customer_product_id: true,
	entitlement_id: true,
	internal_customer_id: true,
	internal_entity_id: true,
	internal_feature_id: true,
	balance: true,
	adjustment: true,
	additional_balance: true,
	unlimited: true,
	usage_allowed: true,
	next_reset_at: true,
	reset_cycle_anchor: true,
	expires_at: true,
	external_id: true,
	created_at: true,
	usage_attribution: true,
	entities: true,
})
	// The table stores these NOT NULL; the shared schema allows null or fills defaults, and a default would leak into a change's `before`.
	.extend({
		balance: z.number(),
		adjustment: z.number(),
		additional_balance: z.number(),
	})
	.strict();

export type WorkerCustomerEntitlement = z.infer<
	typeof workerCustomerEntitlementSchema
>;
