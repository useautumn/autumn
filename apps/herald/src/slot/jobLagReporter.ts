import { instanceIdOf } from "@autumn/blue-green";
import type { AutumnLogger } from "@autumn/logging";
import type { JobHealth } from "./types/heraldHeartbeat.js";

export const JOB_LAG_REPORT_INTERVAL_MS = 20_000;

type Schedule = (params: { intervalMs: number; run(): void }) => () => void;

export type JobLagReporter = { start(): void; stop(): void };

export function createJobLagReporter({
	ctx,
}: {
	ctx: {
		readJobs(): JobHealth[];
		logger: Pick<AutumnLogger, "info">;
		schedule?: Schedule;
	};
}): JobLagReporter {
	const instanceId = instanceIdOf();
	let cancel: (() => void) | undefined;

	function report(): void {
		for (const job of ctx.readJobs()) {
			if (job.partitions === 0) continue;
			ctx.logger.info(
				{
					type: "herald_job_lag",
					data: {
						instanceId,
						job: job.name,
						partitions: job.partitions,
						maxLagRecords: job.maxLagRecords,
						maxLagMs: job.maxLagMs,
					},
				},
				"Herald job lag",
			);
		}
	}

	function start(): void {
		if (cancel) return;
		cancel = (ctx.schedule ?? scheduleReports)({
			intervalMs: JOB_LAG_REPORT_INTERVAL_MS,
			run: report,
		});
	}

	function stop(): void {
		cancel?.();
		cancel = undefined;
	}

	return { start, stop };
}

function scheduleReports({
	intervalMs,
	run,
}: {
	intervalMs: number;
	run(): void;
}): () => void {
	const timer = setInterval(run, intervalMs);
	timer.unref();
	return () => clearInterval(timer);
}
