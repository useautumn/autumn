import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isCustomerRecentlyUpdated } from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";
import { getRuntimeFullSubjectGateConfig } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";
import { type DrizzleCli, dbCritical, dbReplica } from "./initDrizzle.js";
import { getReplicaRoutingState } from "./replicaRoutingState.js";

export type SubjectReadFrom = "primary" | "replica-ok";
export type SubjectReadSource = "primary" | "replica";

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
	if (!ctx.skipCache) {
		const { replica_share } = getRuntimeFullSubjectGateConfig().read_split;
		if (Math.random() >= replica_share) return primary;
	}
	if (!getReplicaRoutingState().eligible) return primary;

	try {
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
