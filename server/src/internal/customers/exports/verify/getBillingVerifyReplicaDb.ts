import { type DrizzleCli, dbReplica, initDrizzle } from "@/db/initDrizzle.js";
import { billingVerifyExportConfig } from "./billingVerifyExportConfig.js";

let replicaDb: DrizzleCli | null | undefined;

/** The shared replica pool is sized as a per-process outage fallback, far below
 * what a run with `customer.concurrency` verifications in flight needs. Opened on
 * first use, so only a process that runs an export pays for it. */
export const getBillingVerifyReplicaDb = (): DrizzleCli | null => {
	if (replicaDb !== undefined) return replicaDb;

	replicaDb = dbReplica
		? initDrizzle({
				name: "replica-export",
				replica: true,
				maxConnections: billingVerifyExportConfig.customer.replicaPoolMax,
				connectTimeout: 10,
				poolConfig: { application_name: "autumn-replica-export" },
			}).db
		: null;
	return replicaDb;
};
