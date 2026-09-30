import { and, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { users } from "../../../db/schema/auth.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import { TwdError } from "../../../http/apiError.ts";
import { createContext } from "../../../lib/createContext.ts";
import type { Actor } from "../../../lib/types/actor.ts";
import { PermanentJobError } from "../errors/permanentJobError.ts";
import { JOB_HANDLERS } from "../handlers.ts";
import type { JobRow } from "../types/jobRow.ts";
import { JOB_RUNNER_DEFAULTS } from "./jobRunnerConfig.ts";

export type AbortKind = "cancel" | "lease_lost" | "shutdown";

export type LeasedJob = {
	job: JobRow;
	abort: (kind: AbortKind) => void;
	/** Hand the job back to the queue without consuming an attempt. */
	release: () => Promise<void>;
	done: Promise<void>;
};

const isActorVia = (via: string): via is Actor["via"] =>
	via === "session" || via === "system" || via.startsWith("api_key:");

const secs = (ms: number) => sql`make_interval(secs => ${ms / 1000})`;

/** Runs one leased job to a terminal (or re-queued) state; every write is fenced by the lease's token. */
export const runLeasedJob = ({
	job,
	config = JOB_RUNNER_DEFAULTS,
}: {
	job: JobRow;
	config?: typeof JOB_RUNNER_DEFAULTS;
}): LeasedJob => {
	const baseCtx = createContext();
	const { db, logger } = baseCtx;
	const log = { jobId: job.id, kind: job.kind, attempt: job.attempts };
	const fence = and(
		eq(jobs.id, job.id),
		eq(jobs.fencingToken, job.fencingToken),
		eq(jobs.status, "running"),
	);
	const controller = new AbortController();
	let abortKind: AbortKind | undefined;
	const abort = (kind: AbortKind) => {
		if (abortKind) return;
		abortKind = kind;
		controller.abort(new Error(`job aborted: ${kind}`));
	};

	const finish = async (set: PgUpdateSetSource<typeof jobs>) => {
		const updated = await db
			.update(jobs)
			.set({ leaseOwner: null, leaseExpiresAt: null, ...set })
			.where(fence)
			.returning({ id: jobs.id });
		if (updated.length === 0) logger.warn("job finish lost its lease", log);
	};

	const release = () =>
		finish({
			status: "queued",
			attempts: sql`greatest(${jobs.attempts} - 1, 0)`,
		});

	const checkpoint = async (state: Record<string, unknown>) => {
		const updated = await db
			.update(jobs)
			.set({ state })
			.where(fence)
			.returning({ id: jobs.id });
		if (updated.length > 0) return;
		abort("lease_lost");
		throw new Error(`job ${job.id} lost its lease; checkpoint rejected`);
	};

	let lastBeatAt = Date.now();
	const heartbeat = setInterval(async () => {
		try {
			const [row] = await db
				.update(jobs)
				.set({ leaseExpiresAt: sql`now() + ${secs(config.leaseMs)}` })
				.where(fence)
				.returning({ cancelRequestedAt: jobs.cancelRequestedAt });
			if (!row) return abort("lease_lost");
			lastBeatAt = Date.now();
			if (row.cancelRequestedAt) abort("cancel");
		} catch (error) {
			logger.warn("job heartbeat failed", { ...log, error: String(error) });
			if (Date.now() - lastBeatAt > config.leaseMs) abort("lease_lost");
		}
	}, config.heartbeatMs);

	const execute = async () => {
		if (job.cancelRequestedAt) abort("cancel");
		let failure: unknown;
		if (!abortKind) {
			try {
				const [creator] = await db
					.select({ email: users.email })
					.from(users)
					.where(eq(users.id, job.createdBy));
				const actor: Actor | undefined = isActorVia(job.via)
					? {
							userId: job.createdBy,
							email: creator?.email ?? job.createdBy,
							via: job.via,
						}
					: undefined;
				await JOB_HANDLERS[job.kind]({
					ctx: { ...baseCtx, actor },
					job,
					checkpoint,
					signal: controller.signal,
				});
			} catch (error) {
				failure = error;
			}
		}
		clearInterval(heartbeat);

		if (abortKind === "lease_lost") return logger.warn("job lost lease", log);
		if (abortKind === "shutdown") {
			logger.info("job released for shutdown", log);
			return release();
		}
		if (abortKind === "cancel") {
			logger.info("job cancelled", log);
			return finish({ status: "cancelled", finishedAt: sql`now()` });
		}
		if (failure === undefined) {
			logger.info("job succeeded", log);
			return finish({
				status: "succeeded",
				error: null,
				finishedAt: sql`now()`,
			});
		}

		const message =
			failure instanceof Error ? failure.message : String(failure);
		const stack = failure instanceof Error ? failure.stack : undefined;
		const permanent =
			failure instanceof PermanentJobError ||
			(failure instanceof TwdError && failure.status < 500);
		if (permanent || job.attempts >= config.maxAttempts) {
			logger.error("job failed", { ...log, permanent, error: message, stack });
			return finish({
				status: "failed",
				error: message,
				finishedAt: sql`now()`,
			});
		}
		const backoffMs = config.retryBaseMs * 4 ** (job.attempts - 1);
		logger.warn("job failed; retrying", { ...log, backoffMs, error: message });
		return finish({
			status: "queued",
			error: message,
			leaseExpiresAt: sql`now() + ${secs(backoffMs)}`,
		});
	};

	const done = execute().catch((error) =>
		logger.error("job finalize failed", { ...log, error: String(error) }),
	);
	return { job, abort, release, done };
};
