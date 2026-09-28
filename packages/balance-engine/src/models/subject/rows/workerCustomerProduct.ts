import { BillingVersion, CusProductSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** Columns only `customers.get` renders: absent on rows logged before it, and left out of the log's snapshot. */
export const customerProductRenderedColumns = {
	product_id: true,
	customer_id: true,
	entity_id: true,
	updated_at: true,
	canceled: true,
	trial_ends_at: true,
	billing_cycle_anchor: true,
	canceled_at: true,
	free_trial_id: true,
	collection_method: true,
	subscription_ids: true,
	scheduled_ids: true,
	processor: true,
	api_semver: true,
	is_custom: true,
	released_at: true,
	billing_version: true,
	external_id: true,
	stripe_checkout_session_id: true,
	metadata_id: true,
	previous_customer_product_id: true,
	on_trial_end: true,
} as const;

/** The whole customer_products row: the columns check and track read, and the rest `customers.get` renders. */
export const workerCustomerProductSchema = CusProductSchema.omit({
	// Joined onto seat rows at read time; not columns of customer_products.
	parent_customer_license: true,
	parent_customer_product: true,
})
	// No defaults on stored columns: a default would leak into a change's `before`.
	.extend({
		quantity: z.number(),
		starts_at: z.number(),
		canceled: z.boolean(),
		is_custom: z.boolean(),
		billing_version: z.enum(BillingVersion),
	})
	.partial(customerProductRenderedColumns)
	.strict();

export type WorkerCustomerProduct = z.infer<typeof workerCustomerProductSchema>;
