import { customers } from "@autumn/shared";
import { and, eq, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type CustomerBalanceSyncDb = DrizzleCli;

const CUSTOMER_BALANCE_SYNC_LOCK_TIMEOUT_MS = 10_000;

const resolveInternalCustomerId = async ({
	db,
	ctx,
	customerId,
}: {
	db: CustomerBalanceSyncDb;
	ctx: AutumnContext;
	customerId: string;
}): Promise<string> => {
	const customer = await db.query.customers.findFirst({
		columns: { internal_id: true },
		where: and(
			or(eq(customers.id, customerId), eq(customers.internal_id, customerId)),
			eq(customers.org_id, ctx.org.id),
			eq(customers.env, ctx.env),
		),
	});

	// A stale sync can outlive customer deletion. There is no remaining customer
	// lifecycle to serialize with in that case, so retain the old no-op path.
	return customer?.internal_id ?? customerId;
};

/**
 * Serializes Redis-to-Postgres balance snapshots for one customer.
 *
 * The transaction-scoped advisory lock must be acquired before Redis is read
 * and held through the matching Postgres write. That prevents a delayed sync
 * worker from overwriting a newer lifecycle cutover with an older snapshot.
 */
export const withCustomerBalanceSyncLock = async <T>({
	ctx,
	customerId,
	internalCustomerId,
	callback,
	onTransactionFailure,
}: {
	ctx: AutumnContext;
	customerId: string;
	/** Pass this when the caller already has a verified customer record. */
	internalCustomerId?: string;
	callback: ({ db }: { db: CustomerBalanceSyncDb }) => Promise<T>;
	onTransactionFailure?: ({ error }: { error: unknown }) => Promise<void>;
}): Promise<T> => {
	try {
		return await ctx.db.transaction(async (transaction) => {
			const db = transaction as unknown as CustomerBalanceSyncDb;
			await db.execute(
				sql.raw(
					`SET LOCAL lock_timeout = ${CUSTOMER_BALANCE_SYNC_LOCK_TIMEOUT_MS}`,
				),
			);
			const canonicalInternalCustomerId =
				internalCustomerId ??
				(await resolveInternalCustomerId({ db, ctx, customerId }));
			const lockKey = `customer-balance-sync:${ctx.org.id}:${ctx.env}:${canonicalInternalCustomerId}`;
			await db.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
			);
			return callback({ db });
		});
	} catch (error) {
		if (onTransactionFailure) {
			try {
				await onTransactionFailure({ error });
			} catch (failureHandlerError) {
				throw new AggregateError(
					[error, failureHandlerError],
					"Customer balance-sync transaction and failure handler both failed.",
				);
			}
		}
		throw error;
	}
};
