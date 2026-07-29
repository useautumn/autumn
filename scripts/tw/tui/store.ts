/**
 * Shared, mutable UI state for the `bun tw` opentui TUI.
 *
 * The orchestrator (commands/run.ts) drives this store via the exported mutators
 * at each lifecycle hook (warm activity, stripe/worker provisioning, per-file
 * test results, teardown deletions, final summary). The React app reads the live
 * state and re-renders on a fixed ~10fps tick (see App.tsx) — the proven
 * mutable-state + interval-flush pattern, which decouples high-frequency updates
 * from render cost and avoids per-mutation reconciliation.
 *
 * Pure data + functions only (no JSX), so it's covered by the scripts tsconfig.
 */

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
	failedTests: TuiFailedTest[];
	crashError?: string;
};

export type TuiSummary = {
	passed: number;
	failed: number;
	/** FILE-level failures — can be nonzero while `failed` (test asserts) is 0 (exec deaths). */
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
	/** WARM-UP: single elided activity line + whether we're building vs reusing cache. */
	warmActivity: string;
	warmBuilding: boolean;
	/**
	 * Monotonic warm-up stage index (see {@link WARM_STAGE_PATTERNS}); -1 until the
	 * first recognized marker. Drives the dashboard's warm-up stepper so the
	 * snapshot/build phase shows real per-stage progress instead of looking frozen.
	 */
	warmStage: number;
	/** Warm cache hit kind (exact sha / stale `:latest`) — null when building. */
	warmHit: "exact" | "stale" | null;
	/** Epoch-ms the CURRENT phase started — lets the UI show a live elapsed timer. */
	phaseStartedAt: number;
	/** Latest non-empty log line in ANY phase — the dashboard's activity ticker. */
	lastLine: string;
	/** FAN-OUT progress. */
	stripeDone: number;
	stripeTotal: number;
	workersReady: number;
	workersTotal: number;
	/** Workers that failed to provision (restore/checkout/boot error before READY). */
	workersFailed: number;
	/** RUN: per-file results keyed by absolute path, + the total file count. */
	files: Map<string, TuiTestFile>;
	runTotal: number;
	/** TEARDOWN progress. */
	sandboxesDone: number;
	sandboxesTotal: number;
	accountsDone: number;
	accountsTotal: number;
	/** DONE. */
	summary?: TuiSummary;
	/** Raw logs ring buffer for Pane B. */
	logs: string[];
	/** Live web dashboard URL (when `--dashboard`), shown in the header. */
	dashboardUrl?: string;
};

const MAX_LOG_LINES = 5000;

/**
 * Ordered warm-up stage matchers, scoped to the actual `[tw-build-base]` /
 * `[tw-warmup]` script output (NOT the orchestrator's own `[tw]` summary lines,
 * which mention every stage at once and would jump the stepper to the end). The
 * index of the highest matching pattern becomes the (monotonic) `warmStage`.
 *
 * Labels for these indices live in the dashboard (apps/testbench Overall view) —
 * keep the two in the same order:
 *   0 base image · 1 checkout · 2 install · 3 migrate · 4 seed · 5 snapshot
 */
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

/** Reset everything (a fresh run reuses the module singleton). */
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

/** Mark the warm phase as a cache hit — the dashboard collapses the stepper. */
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

/** Set fan-out totals (Stripe accounts + workers both equal the pool size). */
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

/**
 * Insert/replace a per-file test result. When a file first reaches a terminal
 * verdict, emit a one-line completion entry into the logs (Pane B) — Pane A only
 * shows IN-PROGRESS tests, so finished results live in the log pane.
 */
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
	// Dashboard speed graph: record FINAL verdicts only (a will-retry failure
	// isn't done yet). No-op unless the dashboard is enabled.
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

/** Append a raw log line for Pane B (bounded ring buffer). */
export const appendLog = (line: string): void => {
	state.logs.push(line);
	if (state.logs.length > MAX_LOG_LINES) {
		state.logs.splice(0, state.logs.length - MAX_LOG_LINES);
	}
	const trimmed = line.trim();
	if (trimmed) {
		state.lastLine = trimmed;
	}
	// During warm-up the elided activity line tracks the latest build/log line,
	// and the monotonic stage stepper advances off recognized script markers.
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

/** Derived tallies for the RUN progress line/bar. */
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
