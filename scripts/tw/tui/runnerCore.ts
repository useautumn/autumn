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
import {
	appendErrorsOutput,
	getFileOutput,
	isSkipRequested,
} from "../dashboard/hub.ts";
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
	| "retrying"
	| "skipped";

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

/** Feed the dashboard's live errors tab, mirroring the terminal failure report. */
const emitFailureFeed = (result: InternalResult, willRetry: boolean): void => {
	const failures = toFailedTests(result.tests);
	const parts: string[] = [
		`\n\x1b[31m✗ ${result.file}\x1b[0m${willRetry ? " \x1b[33m(retrying)\x1b[0m" : ""}\n`,
	];
	if (result.crashError) {
		const crashLines = result.crashError
			.split("\n")
			.filter((line) => line.trim())
			.slice(0, 6);
		parts.push(`    \x1b[31mCRASH:\x1b[0m ${crashLines.shift() ?? ""}\n`);
		for (const line of crashLines) {
			parts.push(`        ${line}\n`);
		}
	}
	for (const t of failures) {
		parts.push(`    \x1b[31m✗\x1b[0m ${t.name}\n`);
		if (t.location) {
			parts.push(`        ${t.location}\n`);
		}
		if (t.message) {
			parts.push(`        ${t.message}\n`);
		}
	}
	if (failures.length === 0 && !result.crashError) {
		// No parsed verdicts and no crash detail — the last output lines are the
		// only evidence of what happened (e.g. the run died mid-file).
		const tail = getFileOutput(result.file)
			.trimEnd()
			.split("\n")
			.slice(-12)
			.join("\n")
			.trim();
		parts.push(
			tail
				? `${tail}\n`
				: "    (no test output captured — exec/transport failure before any verdict)\n",
		);
	}
	appendErrorsOutput(parts.join(""));
};

/** Note a retry recovery in the errors feed so earlier failure entries resolve. */
const emitRetryOutcomeFeed = (result: InternalResult): void => {
	if (result.passedOnRetry) {
		appendErrorsOutput(
			`\n\x1b[32m✓ ${result.file} recovered on retry\x1b[0m\n`,
		);
	}
};

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
	// Dashboard-requested skip: honored when the slot opens and the file hasn't
	// started yet (first attempt only — a retry is already half-run work).
	if (attempt === 1 && isSkipRequested(file)) {
		return {
			file,
			status: "skipped",
			tests: [],
			attempt,
			passedOnRetry: false,
		};
	}
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
			// Zero tests + exit 0 is an empty/skipped file, not a crash.
			crashError:
				tests.length === 0 && exitCode !== 0 && stderr.trim()
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
			const willRetry = params.willRetry && result.status === "failed";
			emit(result, willRetry);
			if (result.status === "failed") {
				emitFailureFeed(result, willRetry);
			}
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
	emitFailureFeed(capped, params.willRetry);
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

		// Failed → re-enqueue the retry into the SAME window right away (no phase-2
		// wait). It competes for a slot with the still-running first attempts and
		// lands on a free worker as soon as one frees up.
		const firstAttemptFailures = first.tests.filter(
			(test) => test.status === "failed",
		);

		emit({ ...first, status: "retrying", firstAttemptFailures }, false);

		// Whole-file retry (no --test-name-pattern): files are stateful sequences,
		// so a filtered retry of a later test lacks earlier tests' state and can't pass.
		const retryResult = await runWithReschedule({
			limit,
			file,
			attempt: 2,
			failedTestNames: [],
			executor,
			willRetry: false,
		});
		retryResult.passedOnRetry = retryResult.status === "passed";
		retryResult.firstAttemptFailures = firstAttemptFailures;
		emit(retryResult, false);
		emitRetryOutcomeFeed(retryResult);
	};

	await Promise.all(files.map(runFileWithRetry));
};
