import {
	type CustomerProductProcessor,
	customerProducts,
} from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import { markCustomersUpdatedAtByInternalIds } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

/** Shallow-merges keys into `processor` in one statement, so concurrent processor writes don't clobber each other. */
export const mergeCustomerProductProcessor = async ({
	db,
	cusProductId,
	processor,
}: {
	db: DrizzleCli;
	cusProductId: string;
	processor: Partial<CustomerProductProcessor>;
}): Promise<void> => {
	const results = await db
		.update(customerProducts)
		.set({
			processor: sql`COALESCE(${customerProducts.processor}, '{}'::jsonb) || ${JSON.stringify(processor)}::jsonb`,
			updated_at: Date.now(),
		})
		.where(eq(customerProducts.id, cusProductId))
		.returning({
			internal_customer_id: customerProducts.internal_customer_id,
		});

	await markCustomersUpdatedAtByInternalIds({
		db,
		internalCustomerIds: results.map((row) => row.internal_customer_id),
	});
};
