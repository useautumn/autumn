import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { REPLICA_LAG_MAX_MS } from "@/db/probes/replicaLagProbe.js";

/** Derived from REPLICA_LAG_MAX_MS so the ledger window and the replica lag
 *  bound cannot drift apart — the ledger only covers lag inside this window. */
export const CUSTOMER_FRESHNESS_WINDOW_S = REPLICA_LAG_MAX_MS / 1000;

/** True when the customer had a structural write inside the freshness window
 *  (DB clock only) — such reads must be routed to the primary. */
export const isCustomerRecentlyUpdated = async ({
	db,
	orgId,
	env,
	customerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	customerId: string;
}): Promise<boolean> => {
	const rows = await db.execute(sql`
		SELECT true AS fresh
		FROM customer_lsns
		WHERE org_id = ${orgId}
			AND env = ${env}
			AND customer_id = ${customerId}
			AND updated_at > now() - make_interval(secs => ${CUSTOMER_FRESHNESS_WINDOW_S})
		LIMIT 1
	`);

	return rows.length > 0;
};
