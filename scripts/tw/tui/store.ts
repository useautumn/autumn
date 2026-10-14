import { recordCompletion } from "../dashboard/hub.ts";

export type TuiPhase = "warm" | "fanout" | "run" | "teardown" | "done";

export type TuiFailedTest = {
	name: string;
	location?: string;
	message?: string;
};

export type TuiTestFile = {
	file: string;
	status: "pending" | "running" | "passed" | "failed" | "retrying" | "skipped";
	passed: number;
	failed: number;
	currentTest?: string;
	attempt: number;
	willRetry: boolean;
	passedOnRetry: boolean;
	workerDeaths?: number;
	failedTests: TuiFailedTest[];
	crashError?: string;
};

export type TuiSummary = {
	passed: number;
	failed: number;
	filesFailed: number;
	crashed: number;
	wallMs: number;
	costLine?: string;
	logFile?: string;
};

export type TuiState = {
	phase: TuiPhase;
	target: string;
	workers: number;
	warmActivity: string;
	warmBuilding: boolean;
	warmStage: number;
	warmHit: "exact" | "stale" | null;
	phaseStartedAt: number;
	lastLine: string;
	stripeDone: number;
	stripeTotal: number;
	workersReady: number;
	workersTotal: number;
	workersFailed: number;
	files: Map<string, TuiTestFile>;
	runTotal: number;
	sandboxesDone: number;
	sandboxesTotal: number;
	accountsDone: number;
	accountsTotal: number;
	summary?: TuiSummary;
	logs: string[];
	dashboardUrl?: string;
};

const MAX_LOG_LINES = 5000;

const WARM_STAGE_PATTERNS: ((line: string) => boolean)[] = [
	(l) => l.includes("[tw-build-base]"),
	(l) =>
		l.includes("[tw-warmup]") &&
		(l.includes("Ensuring working tree") || l.includes("HEAD at")),
	(l) => l.includes("[tw-warmup]") && l.includes("bun install"),
	(l) => l.includes("[tw-warmup]") && l.includes("migrate"),
	(l) => l.includes("[tw-warmup]") && l.includes("Seeding"),
	(l) =>
		l.includes("[tw-warmup]") &&
		(l.includes("snapshot") || l.includes("WARM layer ready")),
];

const state: TuiState = {
	phase: "warm",
	target: "",
	workers: 0,
	warmActivity: "",
	warmBuilding: false,
	warmStage: -1,
	warmHit: null,
	phaseStartedAt: Date.now(),
	lastLine: "",
	stripeDone: 0,
	stripeTotal: 0,
	workersReady: 0,
	workersTotal: 0,
	workersFailed: 0,
	files: new Map(),
	runTotal: 0,
	sandboxesDone: 0,
	sandboxesTotal: 0,
	accountsDone: 0,
	accountsTotal: 0,
	summary: undefined,
	logs: [],
	dashboardUrl: undefined,
};

export const getTuiState = (): TuiState => state;

export const setDashboardUrl = (url: string): void => {
	state.dashboardUrl = url;
};

export const resetTui = (): void => {
	state.phase = "warm";
	state.target = "";
	state.workers = 0;
	state.warmActivity = "";
	state.warmBuilding = false;
	state.warmStage = -1;
	state.warmHit = null;
	state.phaseStartedAt = Date.now();
	state.lastLine = "";
	state.stripeDone = 0;
	state.stripeTotal = 0;
	state.workersReady = 0;
	state.workersTotal = 0;
	state.workersFailed = 0;
	state.files = new Map();
	state.runTotal = 0;
	state.sandboxesDone = 0;
	state.sandboxesTotal = 0;
	state.accountsDone = 0;
	state.accountsTotal = 0;
	state.summary = undefined;
	state.logs = [];
	state.dashboardUrl = undefined;
};

export const setPhase = (phase: TuiPhase): void => {
	state.phase = phase;
	state.phaseStartedAt = Date.now();
};

export const setRunMeta = (target: string, workers: number): void => {
	state.target = target;
	state.workers = workers;
};

export const setWarmActivity = (activity: string, building: boolean): void => {
	state.warmActivity = activity;
	state.warmBuilding = building;
};

export const setWarmHit = (kind: "exact" | "stale"): void => {
	state.warmHit = kind;
};

export const setStripeProgress = (done: number, total: number): void => {
	state.stripeDone = done;
	state.stripeTotal = total;
};

export const setWorkerProgress = (ready: number, total: number): void => {
	state.workersReady = ready;
	state.workersTotal = total;
};

export const setFanoutTotals = (total: number): void => {
	state.stripeTotal = total;
	state.workersTotal = total;
};

export const bumpStripeDone = (): void => {
	state.stripeDone++;
};

export const bumpWorkerReady = (): void => {
	state.workersReady++;
};

export const bumpWorkerFailed = (): void => {
	state.workersFailed++;
};

export const bumpSandboxDone = (): void => {
	state.sandboxesDone++;
};

export const bumpAccountDone = (): void => {
	state.accountsDone++;
};

export const setRunTotal = (total: number): void => {
	state.runTotal = total;
};

const isTerminal = (status: TuiTestFile["status"]): boolean =>
	status === "passed" || status === "failed" || status === "skipped";

export const upsertTestFile = (result: TuiTestFile): void => {
	const previous = state.files.get(result.file);
	state.files.set(result.file, result);

	const justFinished =
		isTerminal(result.status) && !(previous && isTerminal(previous.status));
	if (!justFinished) {
		return;
	}
	const name = result.file.split("/").pop() ?? result.file;
	if (result.status === "skipped") {
		appendLog(`⊘ ${name} — skipped from the dashboard`);
	} else if (result.status === "passed") {
		appendLog(
			`✓ ${name} (✓${result.passed})${result.passedOnRetry ? " (retry)" : ""}`,
		);
	} else {
		appendLog(
			`✗ ${name} (✓${result.passed} ✗${result.failed})${result.willRetry ? " — retrying" : ""}`,
		);
	}
	if (result.status === "passed" || !result.willRetry) {
		recordCompletion(result.file);
	}
};

export const setTeardownSandboxes = (done: number, total: number): void => {
	state.sandboxesDone = done;
	state.sandboxesTotal = total;
};

export const setTeardownAccounts = (done: number, total: number): void => {
	state.accountsDone = done;
	state.accountsTotal = total;
};

export const setSummary = (summary: TuiSummary): void => {
	state.summary = summary;
};

export const appendLog = (line: string): void => {
	state.logs.push(line);
	if (state.logs.length > MAX_LOG_LINES) {
		state.logs.splice(0, state.logs.length - MAX_LOG_LINES);
	}
	const trimmed = line.trim();
	if (trimmed) {
		state.lastLine = trimmed;
	}
	if (state.phase === "warm" && line.trim()) {
		state.warmActivity = line.trim();
		state.warmBuilding = true;
		for (let i = WARM_STAGE_PATTERNS.length - 1; i >= 0; i--) {
			if (WARM_STAGE_PATTERNS[i](line)) {
				if (i > state.warmStage) {
					state.warmStage = i;
				}
				break;
			}
		}
	}
};

export const runTallies = (): {
	done: number;
	passed: number;
	failed: number;
	running: number;
	retrying: number;
	skipped: number;
} => {
	let done = 0;
	let skipped = 0;
	let passed = 0;
	let failed = 0;
	let running = 0;
	let retrying = 0;
	for (const file of state.files.values()) {
		if (file.status === "passed") {
			done++;
			passed++;
		} else if (file.status === "failed") {
			done++;
			failed++;
		} else if (file.status === "running") {
			running++;
		} else if (file.status === "retrying") {
			retrying++;
		} else if (file.status === "skipped") {
			done++;
			skipped++;
		}
	}
	return { done, passed, failed, running, retrying, skipped };
};
