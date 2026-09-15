import { customerEntitlements, entitlements } from "@autumn/shared";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { CronContext } from "@/cron/utils/CronContext.js";

/** Bounded per tick so one sweep can never hold a long transaction on a table
 * this large; the next tick picks up where it left off. */
const DELETE_BATCH_SIZE = 5_000;
const MAX_BATCHES_PER_TICK = 20;

/**
 * Deletes expired purchase grants: loose rows stamped with a purchase
 * `metadata.source` whose `expires_at` has passed. Other loose rows (reward
 * grants, carry-overs) are untouched — they are filtered from reads today and
 * deleting them would change existing behavior.
 *
 * Seeks the loose-expiry index and deletes by primary key.
 */
export const deleteExpiredGrants = async ({
	ctx,
	now = Date.now(),
	internalCustomerId,
}: {
	ctx: CronContext;
	now?: number;
	/** Narrows the sweep to one customer; the cron sweeps everything. */
	internalCustomerId?: string;
}): Promise<{ deleted: number }> => {
	let deleted = 0;

	for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch++) {
		const expired = await ctx.db
			.select({
				id: customerEntitlements.id,
				entitlementId: customerEntitlements.entitlement_id,
			})
			.from(customerEntitlements)
			.where(
				and(
					isNull(customerEntitlements.customer_product_id),
					isNotNull(customerEntitlements.expires_at),
					lt(customerEntitlements.expires_at, now),
					sql`${customerEntitlements.metadata}->>'source' IS NOT NULL`,
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

		// Each grant minted its own custom definition; the FK cascades the other
		// way, so drop them here or they accumulate forever.
		await ctx.db.delete(entitlements).where(
			and(
				inArray(
					entitlements.id,
					expired.map((row) => row.entitlementId),
				),
				eq(entitlements.is_custom, true),
				isNull(entitlements.internal_product_id),
			),
		);

		deleted += expired.length;
		if (expired.length < DELETE_BATCH_SIZE) break;
	}

	return { deleted };
};
