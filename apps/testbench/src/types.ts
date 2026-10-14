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
	durationMs?: number;
	currentTest?: string;
	attempt: number;
	passedOnRetry: boolean;
	workerDeaths: number;
	willRetry: boolean;
	failedTests: FailedTest[];
};

export type WorkerRow = {
	name: string;
	status: "provisioning" | "booting" | "ready" | "dead" | "failed";
	reason?: string;
	fileCount: number;
	files: { file: string; name: string }[];
};

export type Snapshot = {
	phase: Phase;
	target: string;
	workerCount: number;
	warmActivity: string;
	warmBuilding: boolean;
	warmStage: number;
	warmHit?: "exact" | "stale" | null;
	phaseStartedAt: number;
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
	runStartedAt: number | null;
	summary: {
		passed: number;
		failed: number;
		filesFailed: number;
		crashed: number;
		wallMs: number;
		costLine?: string;
	} | null;
	now: number;
};
