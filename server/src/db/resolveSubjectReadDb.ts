import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isCustomerRecentlyUpdated } from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";
import { type DrizzleCli, dbReplica } from "./initDrizzle.js";
import { getReplicaRoutingState } from "./replicaRoutingState.js";

export type SubjectReadFrom = "primary" | "replica-ok";
export type SubjectReadSource = "primary" | "replica";

// Ledger failures repeat in bursts; one log per window, never per request.
const LEDGER_ERROR_LOG_INTERVAL_MS = 30_000;
let lastLedgerErrorLoggedAt = 0;

let replicaDbOverride: DrizzleCli | null = null;
export const _setReplicaDbOverrideForTesting = (
	db: DrizzleCli | null,
): void => {
	replicaDbOverride = db;
};

/** Picks the pool for a subject hydration. Replica requires EVERY gate to
 *  pass; any doubt (ledger error, ineligible prober, no id) pins primary. */
export const resolveSubjectReadDb = async ({
	ctx,
	readFrom,
	orgId,
	env,
	customerId,
}: {
	ctx: AutumnContext;
	readFrom: SubjectReadFrom;
	orgId: string;
	env: string;
	customerId?: string;
}): Promise<{ db: DrizzleCli; source: SubjectReadSource }> => {
	const primary = { db: ctx.db, source: "primary" as const };
	const replica = replicaDbOverride ?? dbReplica;

	if (readFrom !== "replica-ok" || !ctx.skipCache || !replica || !customerId) {
		return primary;
	}
	if (!getReplicaRoutingState().eligible) return primary;

	try {
		const recentlyUpdated = await isCustomerRecentlyUpdated({
			db: ctx.dbGeneral,
			orgId,
			env,
			customerId,
		});
		if (recentlyUpdated) return primary;
	} catch (error) {
		if (Date.now() - lastLedgerErrorLoggedAt >= LEDGER_ERROR_LOG_INTERVAL_MS) {
			lastLedgerErrorLoggedAt = Date.now();
			logger.error(
				{ type: "replica_ledger_check_failed", error },
				"customer_lsns freshness check failed — pinning subject reads to primary",
			);
		}
		return primary;
	}

	return { db: replica, source: "replica" };
};
