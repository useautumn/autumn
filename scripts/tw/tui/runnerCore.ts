/**
 * Headless swarm test runner — the pLimit sliding-window + two-phase-retry +
 * worker-death reschedule loop, decoupled from any UI. It writes per-file results
 * into the TUI store (store.ts); the opentui App renders that state. This is a
 * deliberate, small re-implementation of the loop embedded in `bun t`'s Ink
 * `runTestsV2.tsx` so that file stays byte-for-byte unchanged.
 *
 * Reuses the canonical executor seam (`TestExecutor` / `WorkerDeathError`) and
 * the swarm-local pure parsers.
 */

import pLimit from "p-limit";
import {
	type TestExecutor,
	WorkerDeathError,
} from "../../testScripts/testExecutor.ts";
import { setRunTotal, type TuiTestFile, upsertTestFile } from "./store.ts";
import {
	extractCurrentTest,
	type ParsedTest,
	parseTestOutput,
} from "./testParse.ts";

/** Cap on attempt-preserving reschedules after worker death (mirrors the Ink runner). */
const MAX_WORKER_DEATH_RESCHEDULES = 5;

type InternalStatus =
	| "running"
	| "passed"
	| "failed"
	| "retry_queued"
	| "retrying";

type InternalResult = {
	file: string;
	status: InternalStatus;
	tests: ParsedTest[];
	firstAttemptFailures?: ParsedTest[];
	currentTest?: string;
	attempt: number;
	passedOnRetry: boolean;
	crashError?: string;
};

const toFailedTests = (tests: ParsedTest[]): TuiTestFile["failedTests"] =>
	tests
		.filter((test) => test.status === "failed")
		.map((test) => ({
			name: test.name,
			location: test.error?.location,
			message: test.error?.message,
		}));

/** Project an internal result into the store's display shape. */
const emit = (result: InternalResult, willRetry: boolean): void => {
	const status: TuiTestFile["status"] =
		result.status === "retry_queued" ? "retrying" : result.status;
	// Failed tests to surface: the latest attempt's failures, or — if the file
	// recovered on retry — what originally failed. (Don't merge both, or a retried
	// file double-counts the same failure.)
	const failures = result.passedOnRetry
		? (result.firstAttemptFailures ?? [])
		: result.tests;
	upsertTestFile({
		file: result.file,
		status,
		passed: result.tests.filter((test) => test.status === "passed").length,
		failed: result.tests.filter((test) => test.status === "failed").length,
		currentTest: result.currentTest,
		attempt: result.attempt,
		willRetry,
		passedOnRetry: result.passedOnRetry,
		failedTests: toFailedTests(failures),
		crashError: result.crashError,
	});
};

/** Run one file through the injected executor; never throws except WorkerDeathError. */
const runOneFile = async (params: {
	file: string;
	attempt: number;
	failedTestNames?: string[];
	executor: TestExecutor;
}): Promise<InternalResult> => {
	const { file, attempt, failedTestNames, executor } = params;
	const running: InternalResult = {
		file,
		status: "running",
		tests: [],
		attempt,
		passedOnRetry: false,
	};
	emit(running, false);

	let output = "";
	const onChunk = (text: string): void => {
		output += text;
		emit(
			{
				...running,
				tests: parseTestOutput(output, file),
				currentTest: extractCurrentTest(output) ?? undefined,
			},
			false,
		);
	};

	try {
		const { exitCode, stderr } = await executor.run({
			file,
			failedTestNames,
			onChunk,
		});
		const combined = stderr ? `${output}${stderr}` : output;
		const tests = parseTestOutput(combined, file);
		const hasFailures = tests.some((test) => test.status === "failed");
		const isFailed = hasFailures || exitCode !== 0;
		const result: InternalResult = {
			file,
			status: isFailed ? "failed" : "passed",
			tests,
			attempt,
			passedOnRetry: false,
			crashError:
				tests.length === 0 && stderr.trim()
					? stderr.trim().slice(0, 1000)
					: undefined,
		};
		return result;
	} catch (error) {
		if (error instanceof WorkerDeathError) {
			throw error;
		}
		return {
			file,
			status: "failed",
			tests: [],
			attempt,
			passedOnRetry: false,
			crashError: error instanceof Error ? error.message : String(error),
		};
	}
};

/** Run a file with attempt-preserving reschedule on worker death (§8.4). */
const runWithReschedule = async (params: {
	limit: ReturnType<typeof pLimit>;
	file: string;
	attempt: number;
	failedTestNames?: string[];
	executor: TestExecutor;
	willRetry: boolean;
}): Promise<InternalResult> => {
	let lastWorkerDeath: WorkerDeathError | undefined;
	for (
		let reschedule = 0;
		reschedule <= MAX_WORKER_DEATH_RESCHEDULES;
		reschedule++
	) {
		try {
			const result = await params.limit(() =>
				runOneFile({
					file: params.file,
					attempt: params.attempt,
					failedTestNames: params.failedTestNames,
					executor: params.executor,
				}),
			);
			emit(result, params.willRetry && result.status === "failed");
			return result;
		} catch (error) {
			if (!(error instanceof WorkerDeathError)) {
				throw error;
			}
			lastWorkerDeath = error;
		}
	}

	const capped: InternalResult = {
		file: params.file,
		status: "failed",
		tests: [],
		attempt: params.attempt,
		passedOnRetry: false,
		crashError: `Worker died repeatedly (>${MAX_WORKER_DEATH_RESCHEDULES} reschedules): ${
			lastWorkerDeath?.message ?? "worker death"
		}`,
	};
	emit(capped, false);
	return capped;
};

/**
 * Run all `files` through `executor` in a single `maxParallel` sliding window.
 * A file that fails attempt 1 is retried IMMEDIATELY (attempt 2) on a free worker
 * — we don't wait for the whole first pass to finish before retrying (the executor
 * prefers a DIFFERENT worker for the rerun, §8.4/§8.7). Writes live state into the
 * TUI store; resolves when every file has a terminal verdict.
 */
export const runSwarmTests = async (
	files: string[],
	executor: TestExecutor,
	opts: { maxParallel: number },
): Promise<void> => {
	setRunTotal(files.length);
	const limit = pLimit(opts.maxParallel);

	const runFileWithRetry = async (file: string): Promise<void> => {
		const first = await runWithReschedule({
			limit,
			file,
			attempt: 1,
			executor,
			willRetry: true,
		});
		if (first.status !== "failed") {
			return;
		}
		if (first.crashError && first.tests.length === 0) {
			emit(first, false);
			return;
		}

		// Failed → re-enqueue the retry into the SAME window right away (no phase-2
		// wait). It competes for a slot with the still-running first attempts and
		// lands on a free worker as soon as one frees up.
		const firstAttemptFailures = first.tests.filter(
			(test) => test.status === "failed",
		);
		const hasUnnamed = firstAttemptFailures.some((test) =>
			test.name.includes("(unnamed)"),
		);
		const failedTestNames = hasUnnamed
			? []
			: firstAttemptFailures.map((test) => test.name);

		emit({ ...first, status: "retrying", firstAttemptFailures }, false);

		const retryResult = await runWithReschedule({
			limit,
			file,
			attempt: 2,
			failedTestNames,
			executor,
			willRetry: false,
		});
		retryResult.passedOnRetry = retryResult.status === "passed";
		retryResult.firstAttemptFailures = firstAttemptFailures;
		emit(retryResult, false);
	};

	await Promise.all(files.map(runFileWithRetry));
};
