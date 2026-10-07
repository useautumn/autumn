import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { invalidateRecentlyUpdatedNegativeCache } from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";

const isTransactionHandle = (db?: DrizzleCli): boolean =>
	!(db && (db as { $client?: unknown }).$client);

// Marks never trust the caller's handle: middleware may have swapped ctx.db to
// a read-only replica, and a tx handle must not carry the ledger row lock.
const resolveAutocommitDb = async (): Promise<DrizzleCli> => {
	// Deliberately dbGeneral, not the dbCritical pool ledger reads use: marks
	// are low-volume post-commit writes, not per-read traffic.
	return (await import("@/db/initDrizzle.js")).dbGeneral;
};

// One retry then a loud log — a failed mark must never fail the write action.
const runMark = async ({
	execute,
	logContext,
}: {
	execute: (db: DrizzleCli) => Promise<unknown>;
	logContext: Record<string, unknown>;
}): Promise<void> => {
	const markDb = await resolveAutocommitDb();
	try {
		await execute(markDb);
	} catch {
		try {
			await execute(markDb);
		} catch (error) {
			logger.error(
				{ type: "customer_lsns_mark_failed", ...logContext, error },
				"customer_lsns freshness mark failed after retry",
			);
		}
	}
};

/** Stamps the freshness ledger after a structural customer write. Postgres
 *  now() is the only clock — never bind a JS timestamp. Never throws. */
export const markCustomerUpdatedAt = async ({
	orgId,
	env,
	customerId,
	internalCustomerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	customerId: string;
	internalCustomerId?: string | null;
}): Promise<void> => {
	await runMark({
		execute: (markDb) =>
			markDb.execute(sql`
				INSERT INTO customer_lsns (org_id, env, customer_id, internal_customer_id)
				VALUES (${orgId}, ${env}, ${customerId}, ${internalCustomerId ?? null})
				ON CONFLICT (org_id, env, customer_id)
				DO UPDATE SET updated_at = now(),
					internal_customer_id = COALESCE(EXCLUDED.internal_customer_id, customer_lsns.internal_customer_id)
			`),
		logContext: { org_id: orgId, env, customer_id: customerId },
	});
	invalidateRecentlyUpdatedNegativeCache({ orgId, env, customerId });
};

const MARK_BATCH_SIZE = 1_000;

/** Bulk mark for batch invalidation chokepoints. No db handle needed — batch
 *  callers have no ctx; marks always resolve their own autocommit pool. */
export const markCustomersUpdatedAt = async ({
	customers,
}: {
	db?: DrizzleCli;
	customers: { orgId: string; env: string; customerId: string }[];
}): Promise<void> => {
	// Dedupe: duplicate conflict targets in one multi-row upsert are an error.
	const byKey = new Map(
		customers
			.filter((customer) => customer.customerId)
			.map((customer) => [
				`${customer.orgId}\u0000${customer.env}\u0000${customer.customerId}`,
				customer,
			]),
	);
	const rows = [...byKey.values()].sort((a, b) =>
		`${a.orgId}${a.env}${a.customerId}`.localeCompare(
			`${b.orgId}${b.env}${b.customerId}`,
		),
	);

	for (let offset = 0; offset < rows.length; offset += MARK_BATCH_SIZE) {
		const batch = rows.slice(offset, offset + MARK_BATCH_SIZE);
		await runMark({
			execute: (markDb) =>
				markDb.execute(sql`
					INSERT INTO customer_lsns (org_id, env, customer_id)
					VALUES ${sql.join(
						batch.map(
							({ orgId, env, customerId }) =>
								sql`(${orgId}, ${env}, ${customerId})`,
						),
						sql`, `,
					)}
					ON CONFLICT (org_id, env, customer_id)
					DO UPDATE SET updated_at = now()
				`),
			logContext: { batch_size: batch.length },
		});
	}

	for (const row of rows) {
		invalidateRecentlyUpdatedNegativeCache(row);
	}
};

/** Mark variant for chokepoints that only know internal customer ids (entity,
 *  customer-product, entitlement services); resolves identity in-statement. */
export const markCustomersUpdatedAtByInternalIds = async ({
	db,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	internalCustomerIds: (string | null | undefined)[];
}): Promise<void> => {
	const ids = [
		...new Set(internalCustomerIds.filter((id): id is string => Boolean(id))),
	];
	if (ids.length === 0) return;

	const idList = sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `,
	);

	// A tx handle may hold uncommitted customers the autocommit mark pool can't
	// see yet — resolve identity on the caller's handle, then stamp autocommit.
	if (isTransactionHandle(db)) {
		try {
			const resolved = await db.execute<{
				org_id: string;
				env: string;
				id: string;
			}>(sql`
				SELECT c.org_id, c.env, c.id
				FROM customers c
				WHERE c.internal_id IN (${idList}) AND c.id IS NOT NULL
			`);
			await markCustomersUpdatedAt({
				customers: resolved.map((row) => ({
					orgId: row.org_id,
					env: row.env,
					customerId: row.id,
				})),
			});
		} catch (error) {
			logger.error(
				{
					type: "customer_lsns_mark_failed",
					internal_customer_ids: ids,
					error,
				},
				"customer_lsns freshness mark failed resolving identity in transaction",
			);
		}
		return;
	}

	await runMark({
		execute: async (markDb) => {
			const marked = await markDb.execute<{
				org_id: string;
				env: string;
				customer_id: string;
			}>(sql`
				INSERT INTO customer_lsns (org_id, env, customer_id, internal_customer_id)
				SELECT c.org_id, c.env, c.id, c.internal_id
				FROM customers c
				WHERE c.internal_id IN (${idList}) AND c.id IS NOT NULL
				ORDER BY c.org_id, c.env, c.id
				ON CONFLICT (org_id, env, customer_id)
				DO UPDATE SET updated_at = now(),
					internal_customer_id = COALESCE(EXCLUDED.internal_customer_id, customer_lsns.internal_customer_id)
				RETURNING org_id, env, customer_id
			`);
			for (const row of marked) {
				invalidateRecentlyUpdatedNegativeCache({
					orgId: row.org_id,
					env: row.env,
					customerId: row.customer_id,
				});
			}
		},
		logContext: { internal_customer_ids: ids },
	});
};
