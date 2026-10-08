import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import type { RunFile, WorkerState } from "../../../api/contract.ts";
import type { SwarmSizing } from "../sizing/types/swarmSizing.ts";

export type SwarmAccount = { accountId: string; secretKey: string };

/** Parent → swarm child, sent once over Bun IPC (keeps secrets out of env/argv). */
export type SwarmInit = {
	type: "init";
	runId: string;
	sha: string;
	/** Absolute local paths, already ordered longest-first. */
	files: string[];
	/** server/tests extracted at `sha`; read file contents here, not from twd's checkout. */
	testsDirAtSha: string;
	grep?: string;
	/** Absolute paths of files that failed every recent dev baseline run: a failure there is final, no retry. */
	noRetryFiles: string[];
	/** First accounts (none when every file is on the stripe-connect shard); more arrive as `add_accounts`. */
	accounts: SwarmAccount[];
	workersWanted: number;
	/** Sizes the Stripe budget as if every usable key ran its full per-key cap. */
	usableKeys: number;
	/** Files per worker and planned workers per shard (twd's sizing decision). */
	sizing: SwarmSizing;
	ingressUrl: string;
	ingressToken: string;
	/** The stripe-connect shard's dedicated platform; absent when SHARD_STRIPE_* is unset. */
	stripeConnectShard?: { secretKey: string; clientId: string };
};

/** Parent → swarm child after init. */
export type SwarmParentMessage =
	| { type: "add_accounts"; accounts: SwarmAccount[] }
	/** This run now holds the stripe-connect account; no other run's worker is on it. */
	| { type: "shard_lease_granted" };

/** Child → parent. `file` paths are server/tests-relative contract ids. */
export type SwarmChildMessage =
	| { type: "phase"; phase: SwarmPhase }
	| {
			type: "worker_started";
			name: string;
			sandboxId: string | null;
			accountId: string;
			/** ISO time its create was requested; Modal bills from create, not from when the fork resolves. */
			createdAt: string;
	  }
	/** Worker culled, dead, or failed to boot: its account can go early. `endedAt` is when terminate returned, absent if unconfirmed. */
	| { type: "worker_ended"; name: string; accountId: string; endedAt?: string }
	/** Accounts the child will not use (no sandbox touched them). */
	| { type: "release_accounts"; accountIds: string[] }
	/** A dedicated sub-account now exists; twd records it for deletion. */
	| { type: "shard_account"; accountId: string }
	/** Ask twd for the stripe-connect account; answered with `shard_lease_granted`. */
	| { type: "shard_lease_request" }
	/** Route a dedicated shard's unregistered accounts to its worker; null drops the route. */
	| { type: "shard_route"; shard: string; workerUrl: string | null }
	/** More accounts the child can use right now. */
	| { type: "demand"; workers: number }
	| { type: "worker"; worker: WorkerState }
	| { type: "file"; file: RunFile; final: boolean }
	/** One attempt's `[tw-file-stats]` line: Stripe load, CPU and memory. */
	| {
			type: "file_stats";
			file: string;
			attempt: number;
			worker: string;
			stats: FileStats;
	  }
	| { type: "log"; file: string | null; worker: string | null; text: string }
	| {
			type: "done";
			outcome: "completed" | "cancelled" | "errored";
			error?: string;
	  };

export type SwarmPhase = "provisioning" | "running" | "tearing_down";

/** Parent → warm child. */
export type WarmInit = { type: "init"; sha: string };

/** Warm child → parent. */
export type WarmChildMessage =
	| { type: "log"; text: string }
	| { type: "done"; ok: boolean; imageTag?: string; error?: string };
