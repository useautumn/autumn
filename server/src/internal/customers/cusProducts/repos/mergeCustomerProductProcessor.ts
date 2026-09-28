import {
	type CustomerProductProcessor,
	customerProducts,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import { markCustomersUpdatedAtByInternalIds } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

/**
 * Shallow-merges keys into `processor` in one statement, so concurrent processor writes don't clobber each other.
 * With `periodEndAtLeast`, skips the write when the stored period already ends later. Returns the merged processor, or null if skipped.
 */
export const mergeCustomerProductProcessor = async ({
	db,
	cusProductId,
	processor,
	periodEndAtLeast,
}: {
	db: DrizzleCli;
	cusProductId: string;
	processor: Partial<CustomerProductProcessor>;
	periodEndAtLeast?: number;
}): Promise<CustomerProductProcessor | null> => {
	const storedPeriodEnd = sql`${customerProducts.processor}->>'current_period_end'`;

	const results = await db
		.update(customerProducts)
		.set({
			processor: sql`COALESCE(${customerProducts.processor}, '{}'::jsonb) || ${JSON.stringify(processor)}::jsonb`,
			updated_at: Date.now(),
		})
		.where(
			and(
				eq(customerProducts.id, cusProductId),
				periodEndAtLeast === undefined
					? undefined
					: sql`(${storedPeriodEnd} IS NULL OR (${storedPeriodEnd})::numeric <= ${periodEndAtLeast})`,
			),
		)
		.returning({
			internal_customer_id: customerProducts.internal_customer_id,
			processor: customerProducts.processor,
		});

	await markCustomersUpdatedAtByInternalIds({
		db,
		internalCustomerIds: results.map((row) => row.internal_customer_id),
	});

	return results[0]?.processor ?? null;
};
