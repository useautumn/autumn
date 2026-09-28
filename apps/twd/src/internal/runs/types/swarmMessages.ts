import type { RunFile, WorkerState } from "../../../api/contract.ts";

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
	accounts: { accountId: string; secretKey: string }[];
	ingressUrl: string;
	ingressToken: string;
};

/** Child → parent. `file` paths are server/tests-relative contract ids. */
export type SwarmChildMessage =
	| { type: "phase"; phase: SwarmPhase; workerCount?: number }
	| { type: "sandbox"; sandboxId: string }
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
