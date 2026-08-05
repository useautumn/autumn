import { logger } from "../../external/logtail/logtailUtils.js";
import { lagToMs, queryReplicaLag } from "./replicaLagQuery.js";
import type { DbProbe } from "./types.js";

/** Serving replicas streaming from the primary. Bump when adding replicas. */
export const EXPECTED_REPLICA_COUNT = 2;

/** Matches the customer_lsns ledger window: replica reads are only safe while
 *  lag stays under it, so breaching this is a route-to-primary signal. */
export const REPLICA_LAG_MAX_MS = 60_000;

export const replicaLagProbe: DbProbe = {
	name: "db_replica_lag",
	run: async ({ db }) => {
		const { blind, inRecovery, replicas, replicaCount, maxReplayLagMs } =
			await queryReplicaLag({ db });

		if (blind) {
			logger.warn(
				{ type: "db_replica_lag_blind", in_recovery: inRecovery },
				"Replica lag probe is not reading a primary",
			);
			return;
		}

		const countOk = replicaCount === EXPECTED_REPLICA_COUNT;
		const lagOk = maxReplayLagMs < REPLICA_LAG_MAX_MS;

		const level = countOk && lagOk ? "info" : "warn";
		logger[level](
			{
				type: "db_replica_lag",
				replica_count: replicaCount,
				expected_replica_count: EXPECTED_REPLICA_COUNT,
				max_replay_lag_ms: Math.round(maxReplayLagMs),
				replicas: replicas.map((row) => ({
					application_name: row.application_name,
					state: row.state,
					sync_state: row.sync_state,
					replay_lag_ms: Math.round(lagToMs(row.replay_lag_ms)),
					write_lag_ms: Math.round(lagToMs(row.write_lag_ms)),
				})),
			},
			countOk && lagOk
				? "Replica lag probe healthy"
				: `Replica lag probe unhealthy (count=${replicaCount}/${EXPECTED_REPLICA_COUNT}, maxReplayLag=${Math.round(maxReplayLagMs)}ms)`,
		);
	},
};
