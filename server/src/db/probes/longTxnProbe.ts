import { sql } from "drizzle-orm";
import { logger } from "../../external/logtail/logtailUtils.js";
import type { DbProbe } from "./types.js";

type LongTxnRow = {
	longest_txn_seconds: number | null;
	max_xmin_lag: number | null;
	pid: number | null;
	wait_event: string | null;
	query_kind: string | null;
	visible_backends: number | null;
};

export const longTxnProbe: DbProbe = {
	name: "db_long_txn",
	run: async ({ db }) => {
		const [row] = await db.execute<LongTxnRow>(sql`
			WITH oldest AS (
				SELECT
					round(extract(epoch FROM (now() - xact_start)))::int AS longest_txn_seconds,
					pid,
					coalesce(wait_event_type || '/' || wait_event, 'on_cpu') AS wait_event,
					CASE WHEN upper(substring(query FROM '[a-zA-Z]+')) IN (
							'SELECT','INSERT','UPDATE','DELETE','WITH','MERGE','CALL','VACUUM',
							'ANALYZE','COPY','TRUNCATE','CREATE','ALTER','DROP','BEGIN','COMMIT',
							'ROLLBACK','SAVEPOINT','SET','SHOW','EXPLAIN','REFRESH','GRANT',
							'REVOKE','LOCK','FETCH','DECLARE','PREPARE','EXECUTE')
						THEN upper(substring(query FROM '[a-zA-Z]+')) END AS query_kind
				FROM pg_stat_activity
				WHERE state <> 'idle' AND xact_start IS NOT NULL AND backend_type = 'client backend'
				ORDER BY xact_start ASC, pid ASC
				LIMIT 1
			)
			SELECT
				coalesce((SELECT longest_txn_seconds FROM oldest), 0) AS longest_txn_seconds,
				coalesce((SELECT max(age(backend_xmin))
					FROM pg_stat_activity WHERE backend_xmin IS NOT NULL), 0) AS max_xmin_lag,
				(SELECT pid FROM oldest) AS pid,
				(SELECT wait_event FROM oldest) AS wait_event,
				(SELECT query_kind FROM oldest) AS query_kind,
				(SELECT count(*)::int FROM pg_stat_activity) AS visible_backends
		`);

		const visibleBackends = row?.visible_backends ?? 0;
		const blind = visibleBackends <= 1;
		if (blind) {
			logger.warn(
				{ type: "db_long_txn_blind", visible_backends: visibleBackends },
				"DB long-txn probe sees <=1 backend — missing pg_monitor visibility?",
			);
		}

		logger.info(
			{
				type: "db_long_txn",
				blind,
				longest_txn_seconds: blind ? null : (row?.longest_txn_seconds ?? 0),
				max_xmin_lag: blind ? null : (row?.max_xmin_lag ?? 0),
				pid: blind ? null : (row?.pid ?? null),
				wait_event: blind ? null : (row?.wait_event ?? null),
				query_kind: blind ? null : (row?.query_kind ?? null),
				visible_backends: visibleBackends,
			},
			"DB long-txn probe",
		);
	},
};
