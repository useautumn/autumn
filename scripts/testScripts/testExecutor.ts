#!/usr/bin/env bun

/**
 * The §8 seam: the runner ({@link file://./runTestsV2.tsx}) keeps all of its
 * parsing / progress-reporting / result-assembly logic, but delegates the
 * *byte source* of a test run to a {@link TestExecutor}.
 *
 * `bun t` injects a {@link LocalExecutor} (spawns `bun test` locally). `bun tw`
 * injects a remote executor (a worker in the cloud swarm). The runner above this
 * seam doesn't care where the bytes came from — the parser is a pure
 * `string -> result` function.
 */

import { spawn } from "bun";

/**
 * The seam between the runner and the thing that actually produces test output.
 *
 * `run` streams raw stdout bytes through `onChunk` (which the runner feeds into
 * the existing parser) and resolves with the *test command's* exit code plus its
 * drained stderr. The exit code MUST come from the test command itself — never
 * from the transport — so worker death cannot masquerade as a non-zero exit
 * (see §8.4 and {@link WorkerDeathError}).
 */
export interface TestExecutor {
	run(args: {
		/** Absolute (local) or worker-relative path to the `.test.ts` file. */
		file: string;
		/** Failed test names from a prior attempt → `--test-name-pattern`. */
		failedTestNames?: string[];
		/** Raw stdout bytes, decoded to text, in arrival order. */
		onChunk: (text: string) => void;
		/** Cooperative cancellation (e.g. SIGINT teardown). */
		signal?: AbortSignal;
	}): Promise<{ exitCode: number; stderr: string }>;
}

/**
 * Thrown by a remote {@link TestExecutor} when a worker dies mid-file (µVM
 * evicted, command channel closed, no exit code). This is NOT a test failure:
 * the file received no verdict, so re-parsing partial output would invent a
 * bogus result. The runner treats it as an attempt-preserving reschedule
 * (§8.4), re-submitting the file through the SAME `pLimit` at the SAME attempt
 * number rather than producing a failed `TestFileResult`.
 *
 * The {@link LocalExecutor} never throws this — a local process always yields an
 * exit code — so `bun t` is unaffected.
 */
export class WorkerDeathError extends Error {
	/** The file whose run was lost when the worker died, if known. */
	readonly file?: string;
	/** The worker that died (set by remote executors), if known. */
	readonly workerName?: string;

	constructor(options?: {
		file?: string;
		workerName?: string;
		cause?: unknown;
	}) {
		super(
			options?.workerName
				? `Worker "${options.workerName}" died${options?.file ? ` while running ${options.file}` : ""} (no exit code; transient infra fault)`
				: "Worker died mid-file (no exit code; transient infra fault)",
			options?.cause ? { cause: options.cause } : undefined,
		);
		this.name = "WorkerDeathError";
		this.file = options?.file;
		this.workerName = options?.workerName;
	}
}

/**
 * Escape a literal test name for safe inclusion in a `--test-name-pattern`
 * regular expression. Mirrors the prior inline logic in `runTestFile`.
 */
const TEST_NAME_REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

const buildTestCommand = ({
	file,
	failedTestNames,
}: {
	file: string;
	failedTestNames?: string[];
}): string[] => {
	const command = ["bun", "test", "--timeout", "0"];

	if (failedTestNames && failedTestNames.length > 0) {
		const pattern = failedTestNames
			.map((name) => name.replace(TEST_NAME_REGEX_SPECIALS, "\\$&"))
			.join("|");
		command.push("--test-name-pattern", pattern);
	}

	command.push(file);
	return command;
};

/**
 * Tracks every locally-spawned test process so the SIGINT handler in
 * `runTestsV2.tsx` can SIGKILL them all on Ctrl+C. Exported so the runner's
 * handler can iterate it, preserving the existing kill behavior verbatim.
 */
export const runningProcesses = new Set<ReturnType<typeof spawn>>();

/**
 * The default executor: spawns `bun test --timeout 0 [--test-name-pattern …]
 * <file>` locally, streams stdout into `onChunk`, drains stderr, and resolves
 * with the process exit code. This is the leaf that `bun t` has always used,
 * moved behind the {@link TestExecutor} interface unchanged.
 */
export class LocalExecutor implements TestExecutor {
	async run({
		file,
		failedTestNames,
		onChunk,
		signal,
	}: {
		file: string;
		failedTestNames?: string[];
		onChunk: (text: string) => void;
		signal?: AbortSignal;
	}): Promise<{ exitCode: number; stderr: string }> {
		const command = buildTestCommand({ file, failedTestNames });

		const proc = spawn(command, {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});

		// Track process for cleanup on SIGINT.
		runningProcesses.add(proc);

		// Honor cooperative cancellation by killing the child immediately.
		const onAbort = () => {
			try {
				proc.kill(9);
			} catch {
				// Process might already be dead.
			}
		};
		if (signal) {
			if (signal.aborted) {
				onAbort();
			} else {
				signal.addEventListener("abort", onAbort, { once: true });
			}
		}

		try {
			let stderrOutput = "";
			const stdoutDecoder = new TextDecoder();
			const stderrDecoder = new TextDecoder();

			if (proc.stdout) {
				for await (const chunk of proc.stdout) {
					onChunk(stdoutDecoder.decode(chunk));
				}
			}

			if (proc.stderr) {
				for await (const chunk of proc.stderr) {
					stderrOutput += stderrDecoder.decode(chunk);
				}
			}

			const exitCode = await proc.exited;

			return { exitCode, stderr: stderrOutput };
		} finally {
			runningProcesses.delete(proc);
			if (signal) {
				signal.removeEventListener("abort", onAbort);
			}
		}
	}
}
