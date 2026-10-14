import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import type { RunFile, WorkerState } from "../../../api/contract.ts";
import type { SwarmSizing } from "../sizing/types/swarmSizing.ts";

export type SwarmAccount = { accountId: string; secretKey: string };

export type SwarmInit = {
	type: "init";
	runId: string;
	sha: string;
	files: string[];
	testsDirAtSha: string;
	grep?: string;
	accounts: SwarmAccount[];
	workersWanted: number;
	usableKeys: number;
	sizing: SwarmSizing;
	ingressUrl: string;
	ingressToken: string;
	stripeConnectShard?: { secretKey: string; clientId: string };
};

export type SwarmParentMessage =
	| { type: "add_accounts"; accounts: SwarmAccount[] }
	| { type: "shard_lease_granted" };

export type SwarmChildMessage =
	| { type: "phase"; phase: SwarmPhase }
	| {
			type: "worker_started";
			name: string;
			sandboxId: string | null;
			accountId: string;
			createdAt: string;
	  }
	| { type: "worker_ended"; name: string; accountId: string; endedAt?: string }
	| { type: "release_accounts"; accountIds: string[] }
	| { type: "shard_account"; accountId: string }
	| { type: "shard_lease_request" }
	| { type: "shard_route"; shard: string; workerUrl: string | null }
	| { type: "demand"; workers: number }
	| { type: "worker"; worker: WorkerState }
	| { type: "file"; file: RunFile; final: boolean }
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

export type WarmInit = { type: "init"; sha: string; branch: string };

export type WarmChildMessage =
	| { type: "log"; text: string }
	| { type: "done"; ok: boolean; imageTag?: string; error?: string };
