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
	status: "pending" | "running" | "passed" | "failed" | "retrying";
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
	/** FAN-OUT progress. */
	stripeDone: number;
	stripeTotal: number;
	workersReady: number;
	workersTotal: number;
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

const state: TuiState = {
	phase: "warm",
	target: "",
	workers: 0,
	warmActivity: "",
	warmBuilding: false,
	stripeDone: 0,
	stripeTotal: 0,
	workersReady: 0,
	workersTotal: 0,
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
	state.stripeDone = 0;
	state.stripeTotal = 0;
	state.workersReady = 0;
	state.workersTotal = 0;
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
};

export const setRunMeta = (target: string, workers: number): void => {
	state.target = target;
	state.workers = workers;
};

export const setWarmActivity = (activity: string, building: boolean): void => {
	state.warmActivity = activity;
	state.warmBuilding = building;
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
	status === "passed" || status === "failed";

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
	if (result.status === "passed") {
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
	// During warm-up the elided activity line tracks the latest build/log line.
	if (state.phase === "warm" && line.trim()) {
		state.warmActivity = line.trim();
		state.warmBuilding = true;
	}
};

/** Derived tallies for the RUN progress line/bar. */
export const runTallies = (): {
	done: number;
	passed: number;
	failed: number;
	running: number;
	retrying: number;
} => {
	let done = 0;
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
		}
	}
	return { done, passed, failed, running, retrying };
};
