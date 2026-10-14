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
import {
	getTuiState,
	setRunTotal,
	type TuiTestFile,
	upsertTestFile,
} from "./store.ts";
import {
	extractCurrentTest,
	type ParsedTest,
	parseTestOutput,
} from "./testParse.ts";

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

const emitRetryOutcomeFeed = (result: InternalResult): void => {
	if (result.passedOnRetry) {
		appendErrorsOutput(
			`\n\x1b[32m✓ ${result.file} recovered on retry\x1b[0m\n`,
		);
	}
};

const emit = (result: InternalResult, willRetry: boolean): void => {
	const status: TuiTestFile["status"] =
		result.status === "retry_queued" ? "retrying" : result.status;
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
		workerDeaths: getTuiState().files.get(result.file)?.workerDeaths ?? 0,
		failedTests: toFailedTests(failures),
		crashError: result.crashError,
	});
};

const runOneFile = async (params: {
	file: string;
	attempt: number;
	failedTestNames?: string[];
	executor: TestExecutor;
}): Promise<InternalResult> => {
	const { file, attempt, failedTestNames, executor } = params;
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
		const tests = parseTestOutput(output, file);
		const hasFailures = tests.some((test) => test.status === "failed");
		const isFailed = hasFailures || exitCode !== 0;
		const result: InternalResult = {
			file,
			status: isFailed ? "failed" : "passed",
			tests,
			attempt,
			passedOnRetry: false,
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
			const current = getTuiState().files.get(params.file);
			if (current) {
				upsertTestFile({
					...current,
					workerDeaths: (current.workerDeaths ?? 0) + 1,
				});
			}
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

export const runSwarmTests = async (
	files: string[],
	executor: TestExecutor,
	opts: { maxParallel: number; totalFiles?: number },
): Promise<void> => {
	setRunTotal(opts.totalFiles ?? files.length);
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

		const firstAttemptFailures = first.tests.filter(
			(test) => test.status === "failed",
		);

		emit({ ...first, status: "retrying", firstAttemptFailures }, false);

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
