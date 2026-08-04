import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isCustomerRecentlyUpdated } from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";
import { getRuntimeFullSubjectGateConfig } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";
import { type DrizzleCli, dbCritical, dbReplica } from "./initDrizzle.js";
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

let ledgerDbOverride: DrizzleCli | null = null;
export const _setLedgerDbOverrideForTesting = (db: DrizzleCli | null): void => {
	ledgerDbOverride = db;
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

	if (readFrom !== "replica-ok" || !replica || !customerId) {
		return primary;
	}
	// Outage/worker reads (skipCache) stay 100% replica-eligible; steady-state
	// misses opt in via the configured share (0 = dark, exact status quo).
	if (!ctx.skipCache) {
		const { replica_share } = getRuntimeFullSubjectGateConfig().read_split;
		if (Math.random() >= replica_share) return primary;
	}
	if (!getReplicaRoutingState().eligible) return primary;

	try {
		// Critical pool: warm and sized for the per-read ledger volume on hot
		// routes; the cold general pool starves under it and trips the fail-safe.
		const recentlyUpdated = await isCustomerRecentlyUpdated({
			db: ledgerDbOverride ?? dbCritical,
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
