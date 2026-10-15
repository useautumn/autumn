import { MetadataType, metadata } from "@autumn/shared";
import { addDays } from "date-fns";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";

/** One small statement per tick keeps each delete's WAL to ~10 MB; a backlog drains across ticks. */
const DELETE_BATCH_SIZE = 1_000;

/** Kept well past the 10-day expiry so a late Stripe webhook retry still finds its row. */
const RETENTION_DAYS_AFTER_EXPIRY = 31;

/**
 * Deletes legacy checkout_session_completed rows that expired over a month ago.
 * Nothing reads them after the checkout webhook, unlike other types that crons act on after expiry.
 */
export const deleteExpiredCheckoutMetadata = async ({
	ctx,
	now = Date.now(),
}: {
	ctx: CronContext;
	now?: number;
}): Promise<{ deleted: number }> => {
	const cutoff = addDays(now, -RETENTION_DAYS_AFTER_EXPIRY).getTime();
	const isPurgeable = and(
		eq(metadata.type, MetadataType.CheckoutSessionCompleted),
		lt(metadata.expires_at, cutoff),
	);

	const deletedRows = await withStatementTimeout(ctx.db, (tx) => {
		// A locking CTE runs once; as an IN subquery a semi-join can rescan it and pick past the limit.
		const expiredIds = tx
			.$with("expired_ids")
			.as(
				tx
					.select({ id: metadata.id })
					.from(metadata)
					.where(isPurgeable)
					.orderBy(asc(metadata.expires_at), asc(metadata.id))
					.limit(DELETE_BATCH_SIZE)
					.for("update", { skipLocked: true }),
			);

		return tx
			.with(expiredIds)
			.delete(metadata)
			.where(
				and(
					inArray(
						metadata.id,
						tx.select({ id: expiredIds.id }).from(expiredIds),
					),
					isPurgeable,
				),
			)
			.returning({ id: metadata.id });
	});

	return { deleted: deletedRows.length };
};
