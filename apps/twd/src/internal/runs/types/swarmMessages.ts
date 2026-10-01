import type { RunFile, WorkerState } from "../../../api/contract.ts";

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
	/** First accounts; more arrive as `add_accounts` while the run grows. */
	accounts: SwarmAccount[];
	workersWanted: number;
	/** Sizes the Stripe budget as if every usable key ran its full per-key cap. */
	usableKeys: number;
	ingressUrl: string;
	ingressToken: string;
	/** The stripe-connect shard's dedicated platform; absent when SHARD_STRIPE_* is unset. */
	stripeConnectShard?: { secretKey: string; clientId: string };
};

/** Parent → swarm child after init. */
export type SwarmParentMessage = {
	type: "add_accounts";
	accounts: SwarmAccount[];
};

/** Child → parent. `file` paths are server/tests-relative contract ids. */
export type SwarmChildMessage =
	| { type: "phase"; phase: SwarmPhase }
	| {
			type: "worker_started";
			name: string;
			sandboxId: string | null;
			accountId: string;
	  }
	/** Worker culled, dead, or failed to boot: its account can go early. */
	| { type: "worker_ended"; name: string; accountId: string }
	/** Accounts the child will not use (no sandbox touched them). */
	| { type: "release_accounts"; accountIds: string[] }
	/** Route a dedicated shard's unregistered accounts to its worker; null drops the route. */
	| { type: "shard_route"; shard: string; workerUrl: string | null }
	/** More accounts the child can use right now. */
	| { type: "demand"; workers: number }
	| { type: "worker"; worker: WorkerState }
	| { type: "file"; file: RunFile; final: boolean }
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
