/** Mirrors the `snapshot()` shape sent by scripts/tw/dashboard/server.ts. */

export type Phase = "warm" | "fanout" | "run" | "teardown" | "done";

export type FailedTest = {
	name: string;
	location?: string;
	message?: string;
};

export type FileRow = {
	file: string;
	name: string;
	status: "pending" | "running" | "passed" | "failed" | "retrying" | "skipped";
	passed: number;
	failed: number;
	worker?: string;
	/** Wall duration of the last completed attempt (dispatch → verdict). */
	durationMs?: number;
	currentTest?: string;
	willRetry: boolean;
	failedTests: FailedTest[];
};

export type WorkerRow = {
	name: string;
	status: "provisioning" | "booting" | "ready" | "dead" | "failed";
	/** Why the worker is dead/failed (provision or boot error), when known. */
	reason?: string;
	fileCount: number;
	files: { file: string; name: string }[];
};

export type Snapshot = {
	phase: Phase;
	target: string;
	workerCount: number;
	/** Latest warm-up build/log line (elided activity ticker). */
	warmActivity: string;
	warmBuilding: boolean;
	/** Monotonic warm-up stage index (-1 until first marker); see Overall view. */
	warmStage: number;
	/** Epoch-ms the current phase started — for the live elapsed timer. */
	phaseStartedAt: number;
	/** Latest non-empty log line in any phase (activity ticker). */
	activity: string;
	fanout: {
		stripeDone: number;
		stripeTotal: number;
		workersReady: number;
		workersTotal: number;
		workersFailed: number;
	};
	teardown: {
		sandboxesDone: number;
		sandboxesTotal: number;
		accountsDone: number;
		accountsTotal: number;
	};
	run: {
		total: number;
		done: number;
		passed: number;
		failed: number;
		running: number;
		retrying: number;
		skipped: number;
	};
	files: FileRow[];
	workers: WorkerRow[];
	completions: number[];
	summary: {
		passed: number;
		failed: number;
		/** FILE-level failures — nonzero even when `failed` (test asserts) is 0 (exec deaths). */
		filesFailed: number;
		crashed: number;
		wallMs: number;
		costLine?: string;
	} | null;
	now: number;
};
