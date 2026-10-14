#!/usr/bin/env bun

import { spawn } from "bun";
import { getTestExecutionArgs } from "./testExecutionArgs";

export interface TestExecutor {
	run(args: {
		file: string;
		failedTestNames?: string[];
		onChunk: (text: string) => void;
		signal?: AbortSignal;
	}): Promise<{ exitCode: number; stderr: string }>;
}

export class WorkerDeathError extends Error {
	readonly file?: string;
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

const TEST_NAME_REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

const buildTestCommand = ({
	file,
	failedTestNames,
}: {
	file: string;
	failedTestNames?: string[];
}): string[] => {
	const command = ["bun", "test", ...getTestExecutionArgs()];

	if (failedTestNames && failedTestNames.length > 0) {
		// Bun matches --test-name-pattern against SPACE-joined describe>test
		const pattern = failedTestNames
			.map((name) =>
				name
					.split(" > ")
					.map((segment) => segment.replace(TEST_NAME_REGEX_SPECIALS, "\\$&"))
					.join(" "),
			)
			.join("|");
		command.push("--test-name-pattern", pattern);
	}

	command.push(file);
	return command;
};

export const runningProcesses = new Set<ReturnType<typeof spawn>>();

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

		runningProcesses.add(proc);

		const onAbort = () => {
			try {
				proc.kill(9);
			} catch {}
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

			await Promise.all([
				(async () => {
					for await (const chunk of proc.stdout) {
						onChunk(stdoutDecoder.decode(chunk, { stream: true }));
					}
					onChunk(stdoutDecoder.decode());
				})(),
				(async () => {
					for await (const chunk of proc.stderr) {
						const text = stderrDecoder.decode(chunk, { stream: true });
						stderrOutput += text;
						onChunk(text);
					}
					const remaining = stderrDecoder.decode();
					stderrOutput += remaining;
					onChunk(remaining);
				})(),
			]);

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
