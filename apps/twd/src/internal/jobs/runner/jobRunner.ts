import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { JobKind } from "../../../db/schema/jobs.ts";
import { getDb } from "../../../lib/getDb.ts";
import { getLogger } from "../../../lib/logger.ts";
import { JOB_KINDS, JOB_RUNNER_DEFAULTS } from "./jobRunnerConfig.ts";
import { failExhaustedJobs, leaseNextJob } from "./leaseJobs.ts";
import { type LeasedJob, runLeasedJob } from "./runLeasedJob.ts";

export type JobRunner = { stop: () => Promise<void> };

/** One per process: polls for runnable jobs per kind up to its concurrency and runs them. */
export const startJobRunner = ({
	concurrency,
}: {
	concurrency?: Partial<Record<JobKind, number>>;
} = {}): JobRunner => {
	const config = JOB_RUNNER_DEFAULTS;
	const limits = { ...config.concurrency, ...concurrency };
	const db = getDb();
	const logger = getLogger();
	const owner = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
	const active = new Map<string, LeasedJob>();
	let stopping = false;

	const activeOfKind = (kind: JobKind) =>
		[...active.values()].filter(({ job }) => job.kind === kind).length;

	const tick = async () => {
		const exhausted = await failExhaustedJobs({
			db,
			maxAttempts: config.maxAttempts,
		});
		for (const job of exhausted) logger.error("job exhausted leases", job);

		for (const kind of JOB_KINDS) {
			while (!stopping && activeOfKind(kind) < limits[kind]) {
				const job = await leaseNextJob({
					db,
					kind,
					owner,
					leaseMs: config.leaseMs,
				});
				if (!job) break;
				logger.info("job leased", {
					jobId: job.id,
					kind,
					attempt: job.attempts,
				});
				const leased = runLeasedJob({ job, config });
				active.set(job.id, leased);
				leased.done.finally(() => active.delete(job.id));
			}
		}
	};

	let timer: ReturnType<typeof setTimeout> | undefined;
	let ticking: Promise<void> = Promise.resolve();
	const schedule = () => {
		timer = setTimeout(() => {
			ticking = tick()
				.catch((error) =>
					logger.error("job runner tick failed", { error: String(error) }),
				)
				.finally(() => {
					if (!stopping) schedule();
				});
		}, config.pollMs);
	};
	schedule();
	logger.info("job runner started", { owner, limits });

	return {
		stop: async () => {
			stopping = true;
			clearTimeout(timer);
			await ticking;
			const running = [...active.values()];
			logger.info("job runner stopping", { owner, running: running.length });
			for (const leased of running) leased.abort("shutdown");
			await Promise.race([
				Promise.allSettled(running.map(({ done }) => done)),
				Bun.sleep(config.shutdownGraceMs),
			]);
			const stuck = [...active.values()];
			if (stuck.length === 0) return;
			logger.warn("releasing leases of handlers that ignored shutdown", {
				jobIds: stuck.map(({ job }) => job.id),
			});
			await Promise.allSettled(stuck.map(({ release }) => release()));
		},
	};
};
