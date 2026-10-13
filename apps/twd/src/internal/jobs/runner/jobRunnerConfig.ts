import type { JobKind } from "../../../db/schema/jobs.ts";

export const JOB_KINDS: JobKind[] = [
	"reinit_keys",
	"full_nuke_key",
	"swarm",
	"warm",
	"nuke",
	"qa",
];

export const JOB_RUNNER_DEFAULTS = {
	concurrency: {
		swarm: 50,
		warm: 20,
		nuke: 64,
		reinit_keys: 1,
		full_nuke_key: 8,
		qa: 10,
	} satisfies Record<JobKind, number>,
	leaseMs: 30_000,
	heartbeatMs: 10_000,
	pollMs: 1_000,
	/** Attempts include crashed leases; a graceful shutdown hands its attempt back. */
	maxAttempts: 3,
	retryBaseMs: 5_000,
	shutdownGraceMs: 15_000,
};
