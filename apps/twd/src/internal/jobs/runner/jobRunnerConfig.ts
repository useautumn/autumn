import type { JobKind } from "../../../db/schema/jobs.ts";

export const JOB_KINDS: JobKind[] = ["reinit_keys", "swarm", "warm", "nuke"];

export const JOB_RUNNER_DEFAULTS = {
	concurrency: {
		swarm: 50,
		warm: 20,
		nuke: 64,
		reinit_keys: 1,
	} satisfies Record<JobKind, number>,
	leaseMs: 30_000,
	heartbeatMs: 10_000,
	pollMs: 1_000,
	/** Attempts include crashed leases; a graceful shutdown hands its attempt back. */
	maxAttempts: 3,
	retryBaseMs: 5_000,
	shutdownGraceMs: 15_000,
};
