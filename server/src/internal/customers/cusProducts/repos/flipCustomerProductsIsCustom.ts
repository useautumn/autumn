import { customerProducts } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Compare-and-set: a row whose flag changed since it was read is left alone. */
export const flipCustomerProductsIsCustom = async ({
	db,
	customerProductIds,
	to,
}: {
	db: DrizzleCli;
	customerProductIds: string[];
	to: boolean;
}) => {
	if (customerProductIds.length === 0) return [];

	return db
		.update(customerProducts)
		.set({ is_custom: to, updated_at: Date.now() })
		.where(
			and(
				inArray(customerProducts.id, customerProductIds),
				eq(customerProducts.is_custom, !to),
			),
		)
		.returning({
			id: customerProducts.id,
			internalCustomerId: customerProducts.internal_customer_id,
			customerId: customerProducts.customer_id,
		});
};
