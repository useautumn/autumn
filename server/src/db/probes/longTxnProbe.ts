import { sql } from "drizzle-orm";
import { logger } from "../../external/logtail/logtailUtils.js";
import type { DbProbe } from "./types.js";

type LongTxnRow = {
	longest_txn_seconds: number | null;
	max_xmin_lag: number | null;
	pid: number | null;
	wait_event: string | null;
	visible_backends: number | null;
};

// Longest-running client transaction + how far any backend holds the xmin
// horizon back. Leading signal for the xmin-pin / sync-convoy failure mode: a
// long client txn pins xmin, blocks HOT-prune/VACUUM, and stalls the primary.
export const longTxnProbe: DbProbe = {
	name: "db_long_txn",
	run: async ({ db }) => {
		const [row] = await db.execute<LongTxnRow>(sql`
			SELECT
				coalesce((SELECT round(extract(epoch FROM (now() - min(xact_start))))::int
					FROM pg_stat_activity
					WHERE state <> 'idle' AND xact_start IS NOT NULL
						AND backend_type = 'client backend'), 0) AS longest_txn_seconds,
				coalesce((SELECT max(age(backend_xmin))
					FROM pg_stat_activity WHERE backend_xmin IS NOT NULL), 0) AS max_xmin_lag,
				(SELECT pid FROM pg_stat_activity
					WHERE state <> 'idle' AND xact_start IS NOT NULL AND backend_type = 'client backend'
					ORDER BY xact_start ASC LIMIT 1) AS pid,
				(SELECT coalesce(wait_event_type || '/' || wait_event, 'on_cpu')
					FROM pg_stat_activity
					WHERE state <> 'idle' AND xact_start IS NOT NULL AND backend_type = 'client backend'
					ORDER BY xact_start ASC LIMIT 1) AS wait_event,
				(SELECT count(*)::int FROM pg_stat_activity) AS visible_backends
		`);

		const visibleBackends = row?.visible_backends ?? 0;
		// Without pg_monitor visibility the role sees only its own session, so
		// every metric reads 0 — surface that instead of giving false confidence.
		if (visibleBackends <= 1) {
			logger.warn(
				{ type: "db_long_txn_blind", visible_backends: visibleBackends },
				"DB long-txn probe sees <=1 backend — missing pg_monitor visibility?",
			);
		}

		// The offending query text is intentionally NOT logged (it can contain
		// customer literals). Triage the pinner by pid via `ops db-long`.
		logger.info(
			{
				type: "db_long_txn",
				longest_txn_seconds: row?.longest_txn_seconds ?? 0,
				max_xmin_lag: row?.max_xmin_lag ?? 0,
				pid: row?.pid ?? null,
				wait_event: row?.wait_event ?? null,
				visible_backends: visibleBackends,
			},
			"DB long-txn probe",
		);
	},
};
