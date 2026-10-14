import { CustomerPriceSchema } from "@autumn/shared";
import type { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

export const workerCustomerPriceSchema = openSchema({
	name: "workerCustomerPrice",
	schema: CustomerPriceSchema.pick({
		id: true,
		internal_customer_id: true,
		customer_product_id: true,
		price_id: true,
		created_at: true,
	}),
});

export type WorkerCustomerPrice = z.infer<typeof workerCustomerPriceSchema>;
