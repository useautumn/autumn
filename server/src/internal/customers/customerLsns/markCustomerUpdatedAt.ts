import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";

// A tx handle (no $client) must not carry the mark: the ledger row lock would
// span the caller's transaction, so marks always run autocommit on a pool db.
const resolveAutocommitDb = async (db: DrizzleCli): Promise<DrizzleCli> => {
	if ((db as { $client?: unknown }).$client) return db;
	// Deliberately dbGeneral, not the dbCritical pool ledger reads use: marks
	// are low-volume post-commit writes, not per-read traffic.
	return (await import("@/db/initDrizzle.js")).dbGeneral;
};

// One retry then a loud log — a failed mark must never fail the write action.
const runMark = async ({
	db,
	execute,
	logContext,
}: {
	db: DrizzleCli;
	execute: (db: DrizzleCli) => Promise<unknown>;
	logContext: Record<string, unknown>;
}): Promise<void> => {
	const markDb = await resolveAutocommitDb(db);
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
	db,
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
		db,
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

	await runMark({
		db,
		execute: (markDb) =>
			markDb.execute(sql`
				INSERT INTO customer_lsns (org_id, env, customer_id, internal_customer_id)
				SELECT c.org_id, c.env, c.id, c.internal_id
				FROM customers c
				WHERE c.internal_id IN (${sql.join(
					ids.map((id) => sql`${id}`),
					sql`, `,
				)}) AND c.id IS NOT NULL
				ORDER BY c.org_id, c.env, c.id
				ON CONFLICT (org_id, env, customer_id)
				DO UPDATE SET updated_at = now(),
					internal_customer_id = COALESCE(EXCLUDED.internal_customer_id, customer_lsns.internal_customer_id)
			`),
		logContext: { internal_customer_ids: ids },
	});
};
