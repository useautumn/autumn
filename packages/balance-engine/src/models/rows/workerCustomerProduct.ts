import { CusProductSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** The customer_products columns check and track read; picked from the shared row schema. */
export const workerCustomerProductSchema = CusProductSchema.pick({
	id: true,
	internal_customer_id: true,
	internal_product_id: true,
	internal_entity_id: true,
	status: true,
	options: true,
	quantity: true,
	created_at: true,
})
	// No defaults on stored columns: a default would leak into a change's `before`.
	.extend({ quantity: z.number() })
	.strict();

export type WorkerCustomerProduct = z.infer<typeof workerCustomerProductSchema>;
