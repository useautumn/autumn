import { trace } from "@opentelemetry/api";
import type { Pool } from "pg";
import { attachQueryDeadline } from "./attachQueryDeadline.js";
import { instrumentPoolAcquire } from "./instrumentPoolAcquire.js";
import type { ReportMigrationDbFailure } from "./types/reportMigrationDbFailure.js";

const createFailureReporter =
	({
		pool,
		onFailure,
	}: {
		pool: Pool;
		onFailure?: ReportMigrationDbFailure;
	}): ReportMigrationDbFailure =>
	(fields) => {
		const span = trace.getActiveSpan()?.spanContext();
		try {
			onFailure?.({
				pool: "migration",
				total: pool.totalCount,
				idle: pool.idleCount,
				waiting: pool.waitingCount,
				trace_id: span?.traceId,
				span_id: span?.spanId,
				...fields,
			});
		} catch {}
	};

/** Deadlines every statement on the migration pool and reports checkout and query failures. */
export const applyMigrationQueryDeadline = ({
	pool,
	queryTimeoutMs,
	onFailure,
}: {
	pool: Pool;
	queryTimeoutMs: number;
	onFailure?: ReportMigrationDbFailure;
}): void => {
	const report = createFailureReporter({ pool, onFailure });
	instrumentPoolAcquire({ pool, report });
	pool.on("connect", (client) =>
		attachQueryDeadline({ client, timeoutMs: queryTimeoutMs, report }),
	);
};
