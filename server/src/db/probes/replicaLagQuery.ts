import { withTimeout } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "../initDrizzle.js";

export const REPLICA_LAG_QUERY_TIMEOUT_MS = 4_000;

export type ReplicaLagRow = {
	in_recovery: boolean | null;
	application_name: string | null;
	state: string | null;
	sync_state: string | null;
	replay_lag_ms: string | number | null;
	write_lag_ms: string | number | null;
};

export const lagToMs = (value: string | number | null): number => {
	if (value === null) return 0;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

export type ReplicaLagSnapshot = {
	blind: boolean;
	inRecovery: boolean | null;
	replicas: ReplicaLagRow[];
	replicaCount: number;
	maxReplayLagMs: number;
};

export const queryReplicaLag = async ({
	db,
	timeoutMs = REPLICA_LAG_QUERY_TIMEOUT_MS,
}: {
	db: DrizzleCli;
	timeoutMs?: number;
}): Promise<ReplicaLagSnapshot> => {
	const rows = await withTimeout({
		timeoutMs,
		timeoutMessage: `replica lag query timed out after ${timeoutMs}ms`,
		fn: () =>
			db.execute<ReplicaLagRow>(sql`
				SELECT
					recovery.in_recovery,
					stat.application_name,
					stat.state,
					stat.sync_state,
					EXTRACT(EPOCH FROM stat.replay_lag) * 1000 AS replay_lag_ms,
					EXTRACT(EPOCH FROM stat.write_lag) * 1000 AS write_lag_ms
				FROM (SELECT pg_is_in_recovery() AS in_recovery) AS recovery
				LEFT JOIN pg_stat_replication AS stat
					ON stat.usename = 'pscale_replication'
				ORDER BY stat.application_name ASC
			`),
	});

	const inRecovery = rows[0]?.in_recovery ?? null;
	const blind = rows.length === 0 || inRecovery !== false;
	const replicas = blind
		? []
		: rows.filter((row) => row.application_name !== null);
	const streamingReplicas = replicas.filter((row) => row.state === "streaming");
	const maxReplayLagMs = Math.max(
		0,
		...replicas.map((row) => lagToMs(row.replay_lag_ms)),
	);

	return {
		blind,
		inRecovery,
		replicas,
		replicaCount: streamingReplicas.length,
		maxReplayLagMs,
	};
};
