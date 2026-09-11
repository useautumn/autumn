import { customerEntitlements } from "@autumn/shared";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { CronContext } from "@/cron/utils/CronContext.js";

/** Bounded per tick so one sweep can never hold a long transaction on a table
 * this large; the next tick picks up where it left off. */
const DELETE_BATCH_SIZE = 5_000;
const MAX_BATCHES_PER_TICK = 20;

/**
 * Deletes expired purchase grants — customer_product-linked rows carrying an
 * `expires_at` in the past. Loose rows (reward grants, carry-overs) are left
 * alone: they are filtered from reads today and deleting them would change
 * existing behavior.
 *
 * Seeks on `expires_at` and deletes by primary key so each batch is one index
 * range scan plus a keyed delete.
 */
export const deleteExpiredGrants = async ({
	ctx,
	now = Date.now(),
	internalCustomerId,
}: {
	ctx: CronContext;
	now?: number;
	/** Narrows the sweep to one customer. The cron sweeps everything; tests
	 * scope themselves so a shared database isn't swept out from under them. */
	internalCustomerId?: string;
}): Promise<{ deleted: number }> => {
	let deleted = 0;

	for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch++) {
		const expired = await ctx.db
			.select({ id: customerEntitlements.id })
			.from(customerEntitlements)
			.where(
				and(
					isNotNull(customerEntitlements.customer_product_id),
					isNotNull(customerEntitlements.expires_at),
					lt(customerEntitlements.expires_at, now),
					...(internalCustomerId
						? [
								eq(
									customerEntitlements.internal_customer_id,
									internalCustomerId,
								),
							]
						: []),
				),
			)
			.orderBy(sql`${customerEntitlements.expires_at} ASC`)
			.limit(DELETE_BATCH_SIZE);

		if (expired.length === 0) break;

		await ctx.db.delete(customerEntitlements).where(
			inArray(
				customerEntitlements.id,
				expired.map((row) => row.id),
			),
		);

		deleted += expired.length;
		if (expired.length < DELETE_BATCH_SIZE) break;
	}

	return { deleted };
};
