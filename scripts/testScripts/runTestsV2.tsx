#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "bun";
import { Box, render, Static, Text, useApp } from "ink";
import pLimit from "p-limit";
import { useCallback, useEffect, useRef, useState } from "react";
import { testRunConfig } from "./testRunConfig";

// Base path for shorthand test paths
const INTEGRATION_TEST_BASE = testRunConfig.testsBaseDir;

/** Recursively search for a folder whose path ends with the given suffix. */
async function findFolderByPath(
	basePath: string,
	pathSuffix: string,
): Promise<string | null> {
	const normalizedSuffix = `/${pathSuffix}`;
	try {
		const entries = await readdir(basePath);
		for (const entry of entries) {
			const fullPath = join(basePath, entry);
			const entryStat = await stat(fullPath);

			if (entryStat.isDirectory()) {
				if (fullPath.endsWith(normalizedSuffix)) {
					return fullPath;
				}
				const found = await findFolderByPath(fullPath, pathSuffix);
				if (found) return found;
			}
		}
	} catch {
		// Ignore errors
	}
	return null;
}

/** Recursively search for a file whose path ends with the given suffix. */
async function findFileByPath(
	basePath: string,
	pathSuffix: string,
): Promise<string | null> {
	const normalizedSuffix = `/${pathSuffix}`;
	try {
		const entries = await readdir(basePath);
		for (const entry of entries) {
			const fullPath = join(basePath, entry);
			const entryStat = await stat(fullPath);

			if (entryStat.isDirectory()) {
				const found = await findFileByPath(fullPath, pathSuffix);
				if (found) return found;
			} else if (fullPath.endsWith(normalizedSuffix)) {
				return fullPath;
			}
		}
	} catch {
		// Ignore errors
	}
	return null;
}

// Track all running processes for cleanup
const runningProcesses = new Set<ReturnType<typeof spawn>>();

// Ultra-kill on Ctrl+C
process.on("SIGINT", () => {
	// Kill all running test processes immediately
	for (const proc of runningProcesses) {
		try {
			proc.kill(9); // SIGKILL
		} catch {
			// Process might already be dead
		}
	}
	runningProcesses.clear();

	console.log("\n\n⚠️  Tests interrupted by user (Ctrl+C)\n");
	process.exit(130);
});

interface IndividualTest {
	name: string;
	status: "passed" | "failed";
	duration?: number;
	error?: {
		message: string;
		location?: string;
	};
}

interface TestFileResult {
	file: string;
	status:
		| "pending"
		| "running"
		| "passed"
		| "failed"
		| "retry_queued"
		| "retrying";
	tests: IndividualTest[];
	/** Failed tests from the first attempt (preserved during retry for visibility) */
	firstAttemptFailures?: IndividualTest[];
	currentTest?: string;
	duration: number;
	attempt: number;
	passedOnRetry: boolean;
	/** Captured stderr when a file crashes with 0 tests */
	crashError?: string;
}

// ============================================================================
// Test Output Parsing
// ============================================================================

function parseTestOutput(output: string, filePath: string): IndividualTest[] {
	const tests: IndividualTest[] = [];
	const lines = output.split("\n");

	let lastTestEndIndex = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;

		const passMatch = line.match(/^\(pass\)\s+(.+?)\s+\[(\d+(?:\.\d+)?m?s)\]/);
		const failMatch = line.match(/^\(fail\)\s+(.+?)\s+\[(\d+(?:\.\d+)?m?s)\]/);

		if (passMatch) {
			const name: string = passMatch[1] ?? "";
			const duration: string = passMatch[2] ?? "0ms";
			tests.push({
				name: name.trim(),
				status: "passed",
				duration: parseDuration(duration),
			});
			lastTestEndIndex = i;
		} else if (failMatch) {
			const name: string = failMatch[1] ?? "";
			const duration: string = failMatch[2] ?? "0ms";

			// Look BACKWARDS from this line to find the error output
			const errorStartIndex = lastTestEndIndex + 1;
			const errorLines = lines.slice(errorStartIndex, i);

			const test: IndividualTest = {
				name: name.trim(),
				status: "failed",
				duration: parseDuration(duration),
			};

			parseErrorFromLines(test, errorLines, filePath);
			tests.push(test);
			lastTestEndIndex = i;
		}
	}

	return tests;
}

function parseErrorFromLines(
	test: IndividualTest,
	errorLines: string[],
	filePath: string,
): void {
	const errorText = errorLines.join("\n");

	// Find error message - look for "error:" line
	let errorMessage = "";
	for (const line of errorLines) {
		const errorMatch = line.match(/^error:\s*(.+)/i);
		if (errorMatch?.[1]) {
			errorMessage = errorMatch[1].trim();
			break;
		}
	}

	// Find Expected/Received for assertion errors
	const expectedMatch = errorText.match(/Expected:\s*(.+)/);
	const receivedMatch = errorText.match(/Received:\s*(.+)/);
	if (expectedMatch?.[1] && receivedMatch?.[1]) {
		errorMessage = `Expected: ${expectedMatch[1]}, Received: ${receivedMatch[1]}`;
	}

	// Check for timeout
	if (errorText.includes("this test timed out")) {
		errorMessage = "Test timed out";
	}

	// Find location - prioritize the test file itself in stack trace
	let location: string | undefined;

	for (const line of errorLines) {
		// Match stack trace lines like:
		// at async <anonymous> (/path/to/file.test.ts:38:29)
		// at functionName (/path/to/file.ts:123:45)
		const stackMatch = line.match(/at\s+.*?\(([^)]+\.ts):(\d+):(\d+)\)/);
		const matchedFile = stackMatch?.[1];
		const lineNum = stackMatch?.[2];
		const colNum = stackMatch?.[3];
		if (matchedFile && lineNum && colNum) {
			// Prefer .test.ts files
			if (matchedFile.endsWith(".test.ts")) {
				location = `${matchedFile}:${lineNum}:${colNum}`;
				break;
			}

			// Otherwise take first server file if we don't have one yet
			if (!location && matchedFile.includes("/server/")) {
				location = `${matchedFile}:${lineNum}:${colNum}`;
			}
		}
	}

	// Fall back to the test file path if no location found in stack trace
	if (!location) {
		location = filePath;
	}

	test.error = {
		message: errorMessage || "Test failed",
		location,
	};
}

function parseDuration(duration: string): number {
	if (duration.endsWith("ms")) {
		return Number.parseFloat(duration);
	}
	if (duration.endsWith("s")) {
		return Number.parseFloat(duration) * 1000;
	}
	return Number.parseFloat(duration);
}

function extractCurrentTest(output: string): string | null {
	const lines = output.split("\n");

	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (!line) continue;
		const match = line.match(/^\((?:pass|fail)\)\s+(.+?)\s+\[/);
		if (match?.[1]) {
			return match[1].trim();
		}
	}

	return null;
}

// ============================================================================
// Test Runner Logic
// ============================================================================

async function collectTestFiles(paths: string[]): Promise<string[]> {
	const testFiles: string[] = [];

	const collectRecursive = async (dirPath: string): Promise<void> => {
		try {
			const entries = await readdir(dirPath);
			for (const entry of entries) {
				const fullPath = join(dirPath, entry);
				const entryStat = await stat(fullPath);

				if (entryStat.isDirectory()) {
					await collectRecursive(fullPath);
				} else if (entry.endsWith(".test.ts")) {
					testFiles.push(fullPath);
				}
			}
		} catch (error) {
			console.error(`Error reading directory ${dirPath}:`, error);
		}
	};

	for (const p of paths) {
		const resolved = resolve(process.cwd(), p);

		// If it's a direct .test.ts file, add it directly
		if (p.endsWith(".test.ts") && existsSync(resolved)) {
			testFiles.push(resolved);
			continue;
		}

		await collectRecursive(resolved);
	}

	// Deduplicate (same file may appear via multiple paths)
	return [...new Set(testFiles)];
}

async function runTestFile({
	file,
	onUpdate,
	attempt = 1,
	failedTestNames,
	verbose = false,
}: {
	file: string;
	onUpdate: (result: TestFileResult) => void;
	attempt?: number;
	failedTestNames?: string[];
	verbose?: boolean;
}): Promise<TestFileResult> {
	const startTime = performance.now();

	const result: TestFileResult = {
		file,
		status: "running",
		tests: [],
		duration: 0,
		attempt,
		passedOnRetry: false,
	};

	onUpdate(result);

	try {
		const command = ["bun", "test", "--timeout", "0"];

		if (failedTestNames && failedTestNames.length > 0) {
			const pattern = failedTestNames
				.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
				.join("|");
			command.push("--test-name-pattern", pattern);
		}

		command.push(file);

		const proc = spawn(command, {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});

		// Track process for cleanup on SIGINT
		runningProcesses.add(proc);

		let output = "";
		let stderrOutput = "";
		const decoder = new TextDecoder();
		const stderrDecoder = new TextDecoder();

		const fileLabel = basename(file);

		if (proc.stdout) {
			for await (const chunk of proc.stdout) {
				const text = decoder.decode(chunk);
				output += text;

				if (verbose) {
					process.stderr.write(`[${fileLabel}:stdout] ${text}`);
				}

				// Update with parsed tests
				const tests = parseTestOutput(output, file);
				const currentTest = extractCurrentTest(output);

				onUpdate({
					...result,
					tests,
					currentTest: currentTest || undefined,
				});
			}
		}

		if (proc.stderr) {
			for await (const chunk of proc.stderr) {
				const text = stderrDecoder.decode(chunk);
				output += text;
				stderrOutput += text;

				if (verbose) {
					process.stderr.write(`[${fileLabel}:stderr] ${text}`);
				}
			}
		}

		const exitCode = await proc.exited;

		// Remove from tracking
		runningProcesses.delete(proc);

		const duration = performance.now() - startTime;

		const tests = parseTestOutput(output, file);
		const hasFailures = tests.some((t) => t.status === "failed");
		const hasNoTests = tests.length === 0;
		const processExitedNonZero = exitCode !== 0;

		// A file is considered failed if:
		// 1. Any individual test failed, OR
		// 2. The process exited non-zero (e.g. module import error), OR
		// 3. Zero tests were found AND process exited non-zero (likely a silent import failure)
		// Note: Empty files that run successfully (exit 0) are treated as passed/skipped
		const isFailed = hasFailures || processExitedNonZero;

		const finalResult: TestFileResult = {
			file,
			status: isFailed ? "failed" : "passed",
			tests,
			duration,
			attempt,
			passedOnRetry: false,
			crashError:
				hasNoTests && stderrOutput.trim()
					? stderrOutput.trim().slice(0, 1000)
					: undefined,
		};

		onUpdate(finalResult);
		return finalResult;
	} catch {
		const duration = performance.now() - startTime;
		const finalResult: TestFileResult = {
			file,
			status: "failed",
			tests: [],
			duration,
			attempt,
			passedOnRetry: false,
		};
		onUpdate(finalResult);
		return finalResult;
	}
}

// ============================================================================
// Ink Components
// ============================================================================

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Spinner() {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setFrame((prev: number) => (prev + 1) % SPINNER_FRAMES.length);
		}, 80);
		return () => clearInterval(timer);
	}, []);

	return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
}

function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return `${str.substring(0, maxLength - 3)}...`;
}

function toClickablePath(absolutePath: string): string {
	const workspaceRoot = process.cwd();
	if (absolutePath.startsWith(workspaceRoot)) {
		return `./${absolutePath.slice(workspaceRoot.length + 1)}`;
	}
	return absolutePath;
}

interface CompletedFileProps {
	result: TestFileResult;
	willRetry?: boolean;
}

function CompletedFile({ result, willRetry }: CompletedFileProps) {
	const fileName = basename(result.file);
	const passedCount = result.tests.filter((t) => t.status === "passed").length;
	const failedCount = result.tests.filter((t) => t.status === "failed").length;

	const icon = result.status === "passed" ? "✓" : "✗";
	// Yellow for first failures (will retry), red for final failures
	const iconColor =
		result.status === "passed" ? "green" : willRetry ? "yellow" : "red";
	const retryBadge = willRetry ? " (will retry)" : "";

	return (
		<Box>
			<Text color={iconColor}>{icon} </Text>
			<Text dimColor={result.status === "passed"}>
				{fileName}
				{retryBadge}{" "}
			</Text>
			<Text dimColor>
				(<Text color="green">✓{passedCount}</Text>
				{failedCount > 0 && (
					<Text color={willRetry ? "yellow" : "red"}> ✗{failedCount}</Text>
				)}
				)
			</Text>
		</Box>
	);
}

interface FailedTestProps {
	test: IndividualTest;
	isWarning?: boolean;
}

function FailedTest({ test, isWarning }: FailedTestProps) {
	const color = isWarning ? "yellow" : "red";
	return (
		<Box flexDirection="column" marginLeft={2}>
			<Box>
				<Text color={color}> ✗ </Text>
				<Text>{truncate(test.name, 60)}</Text>
				{test.error?.message && (
					<Text color="yellow"> — {truncate(test.error.message, 70)}</Text>
				)}
			</Box>
			{test.error?.location && (
				<Box marginLeft={4}>
					<Text color="cyan">{toClickablePath(test.error.location)}</Text>
				</Box>
			)}
		</Box>
	);
}

interface RunningFileProps {
	result: TestFileResult;
}

function RunningFile({ result }: RunningFileProps) {
	const fileName = basename(result.file);
	const passedCount = result.tests.filter((t) => t.status === "passed").length;
	const failedCount = result.tests.filter((t) => t.status === "failed").length;

	return (
		<Box>
			<Text> </Text>
			<Spinner />
			<Text> {fileName}</Text>
			{(passedCount > 0 || failedCount > 0) && (
				<Text dimColor>
					{" "}
					(<Text color="green">✓{passedCount}</Text>
					{failedCount > 0 && <Text color="red"> ✗{failedCount}</Text>})
				</Text>
			)}
			{result.currentTest && (
				<Text dimColor> › {truncate(result.currentTest, 35)}</Text>
			)}
		</Box>
	);
}

interface RetryingFileProps {
	result: TestFileResult;
}

function RetryingFile({ result }: RetryingFileProps) {
	const fileName = basename(result.file);
	const passedCount = result.tests.filter((t) => t.status === "passed").length;
	const failedCount = result.tests.filter((t) => t.status === "failed").length;

	return (
		<Box>
			<Text> </Text>
			<Spinner />
			<Text color="yellow"> {fileName} </Text>
			<Text color="yellow">(retrying)</Text>
			{(passedCount > 0 || failedCount > 0) && (
				<Text dimColor>
					{" "}
					(<Text color="green">✓{passedCount}</Text>
					{failedCount > 0 && <Text color="red"> ✗{failedCount}</Text>})
				</Text>
			)}
			{result.currentTest && (
				<Text dimColor> › {truncate(result.currentTest, 35)}</Text>
			)}
		</Box>
	);
}

interface StaticItem {
	key: string;
	type: "result" | "retry_result";
	result: TestFileResult;
	willRetry?: boolean;
}

interface TestRunnerAppProps {
	testFiles: string[];
	maxParallel: number;
	verbose: boolean;
}

function TestRunnerApp({
	testFiles,
	maxParallel,
	verbose,
}: TestRunnerAppProps) {
	const { exit } = useApp();

	// Mutable ref accumulates updates from stdout chunks without triggering re-renders.
	// A fixed-interval timer flushes the ref into React state at ~10fps.
	const pendingRef = useRef<Map<string, TestFileResult>>(new Map());
	const dirtyRef = useRef(false);

	const [results, setResults] = useState<Map<string, TestFileResult>>(
		new Map(),
	);
	const [isComplete, setIsComplete] = useState(false);

	// Track which completed files have already been emitted to <Static>
	// so we only append new ones (Static items are write-once).
	const emittedFilesRef = useRef<Set<string>>(new Set());
	const [staticItems, setStaticItems] = useState<StaticItem[]>([]);

	// Track whether retry phase is complete (to defer static emission of failed files)
	const retryPhaseCompleteRef = useRef(false);

	// Initialize all files as pending
	useEffect(() => {
		const initial = new Map<string, TestFileResult>();
		for (const file of testFiles) {
			initial.set(file, {
				file,
				status: "pending",
				tests: [],
				duration: 0,
				attempt: 1,
				passedOnRetry: false,
			});
		}
		pendingRef.current = initial;
		setResults(initial);
	}, [testFiles]);

	// Flush pending ref into state on a fixed interval (~10fps)
	useEffect(() => {
		const interval = setInterval(() => {
			if (!dirtyRef.current) return;
			dirtyRef.current = false;

			const snapshot = new Map<string, TestFileResult>(pendingRef.current);
			setResults(snapshot);

			// Emit newly-completed files to <Static>
			// Emit passed files immediately, and failed files on first attempt (before retry)
			const newStatic: StaticItem[] = [];
			for (const [file, result] of snapshot.entries()) {
				// Emit passed files
				if (result.status === "passed" && !emittedFilesRef.current.has(file)) {
					emittedFilesRef.current.add(file);
					newStatic.push({ key: file, type: "result", result });
				}
				// Emit failed files on first attempt (will retry)
				if (
					result.status === "failed" &&
					result.attempt === 1 &&
					!emittedFilesRef.current.has(file)
				) {
					emittedFilesRef.current.add(file);
					newStatic.push({
						key: file,
						type: "result",
						result,
						willRetry: true,
					});
				}
				// Emit retry results (either passed or still failed after retry)
				const retryKey = `${file}:retry`;
				if (
					result.attempt === 2 &&
					(result.status === "passed" || result.status === "failed") &&
					!emittedFilesRef.current.has(retryKey)
				) {
					emittedFilesRef.current.add(retryKey);
					newStatic.push({ key: retryKey, type: "retry_result", result });
				}
			}
			if (newStatic.length > 0) {
				setStaticItems((prev: StaticItem[]) => [...prev, ...newStatic]);
			}
		}, 100);

		return () => clearInterval(interval);
	}, []);

	// The callback given to each test process — writes to the mutable ref only
	const updateResult = useCallback((result: TestFileResult) => {
		pendingRef.current.set(result.file, result);
		dirtyRef.current = true;
	}, []);

	// Run tests
	useEffect(() => {
		const runAllTests = async () => {
			const limit = pLimit(maxParallel);

			// Phase 1: Initial run
			const promises = testFiles.map((file) =>
				limit(() =>
					runTestFile({ file, onUpdate: updateResult, attempt: 1, verbose }),
				),
			);

			await Promise.all(promises);

			// Phase 2: Retry failed files with same concurrency as initial run
			const allPendingResults: TestFileResult[] = Array.from(
				pendingRef.current.values(),
			);
			const failedFiles = allPendingResults.filter(
				(r) => r.status === "failed" && r.attempt === 1,
			);

			if (failedFiles.length > 0) {
				// Mark all failed files as queued for retry, preserving first-attempt failures
				for (const result of failedFiles) {
					const firstAttemptFailures = result.tests.filter(
						(t) => t.status === "failed",
					);
					const queuedResult: TestFileResult = {
						...result,
						status: "retry_queued",
						firstAttemptFailures,
					};
					pendingRef.current.set(result.file, queuedResult);
				}
				dirtyRef.current = true;

				// Run retries concurrently with same limit as initial run
				const retryLimit = pLimit(maxParallel);
				const retryPromises = failedFiles.map((result) =>
					retryLimit(async () => {
						const firstAttemptFailures = result.tests.filter(
							(t) => t.status === "failed",
						);
						const failedTestNames = firstAttemptFailures.map((t) => t.name);

						// Mark this specific file as actively retrying
						const retryingResult: TestFileResult = {
							...result,
							status: "retrying",
							firstAttemptFailures,
						};
						pendingRef.current.set(result.file, retryingResult);
						dirtyRef.current = true;

						const retryResult = await runTestFile({
							file: result.file,
							onUpdate: updateResult,
							attempt: 2,
							failedTestNames,
							verbose,
						});
						if (retryResult.status === "passed") {
							retryResult.passedOnRetry = true;
						}
						retryResult.firstAttemptFailures = firstAttemptFailures;
						pendingRef.current.set(result.file, retryResult);
						dirtyRef.current = true;
						return retryResult;
					}),
				);

				await Promise.all(retryPromises);
			}

			// Mark retry phase as complete so failed files can be emitted to static
			retryPhaseCompleteRef.current = true;

			// Final flush to ensure every completed result is captured
			const finalSnapshot = new Map<string, TestFileResult>(pendingRef.current);
			setResults(finalSnapshot);

			const newStatic: StaticItem[] = [];
			for (const [file, result] of finalSnapshot.entries()) {
				if (
					(result.status === "passed" || result.status === "failed") &&
					!emittedFilesRef.current.has(file)
				) {
					emittedFilesRef.current.add(file);
					newStatic.push({ key: file, type: "result", result });
				}
				// Also emit any retry results that weren't captured
				const retryKey = `${file}:retry`;
				if (
					result.attempt === 2 &&
					(result.status === "passed" || result.status === "failed") &&
					!emittedFilesRef.current.has(retryKey)
				) {
					emittedFilesRef.current.add(retryKey);
					newStatic.push({ key: retryKey, type: "retry_result", result });
				}
			}
			if (newStatic.length > 0) {
				setStaticItems((prev: StaticItem[]) => [...prev, ...newStatic]);
			}

			setIsComplete(true);
		};

		if (testFiles.length > 0) {
			runAllTests();
		}
	}, [testFiles, maxParallel, updateResult, verbose]);

	// Exit when complete
	useEffect(() => {
		if (!isComplete) return;

		const exitResults: TestFileResult[] = Array.from(results.values());
		const exitFailedFiles = exitResults.some((r) => r.status === "failed");

		// Small delay to ensure final render
		setTimeout(() => {
			exit();
			process.exit(exitFailedFiles ? 1 : 0);
		}, 100);
	}, [isComplete, results, exit]);

	const allResults: TestFileResult[] = Array.from(results.values());
	const runningFiles = allResults.filter((r) => r.status === "running");
	const retryingFiles = allResults.filter((r) => r.status === "retrying");

	const completedFiles = allResults.filter(
		(r) => r.status === "passed" || r.status === "failed",
	);
	const completedTests = completedFiles.flatMap((r) => r.tests);
	const passedTests = completedTests.filter((t) => t.status === "passed");
	const failedTests = completedTests.filter((t) => t.status === "failed");

	return (
		<Box flexDirection="column">
			{/* Static section: completed files + failures. Written once, never re-rendered. */}
			<Static items={staticItems}>
				{(item: StaticItem) => {
					if (item.type === "retry_result") {
						const { result } = item;
						if (result.status === "passed") {
							return (
								<Box key={item.key}>
									<Text color="green"> ↳ ✓ </Text>
									<Text color="green">
										{basename(result.file)} passed on retry
									</Text>
								</Box>
							);
						}
						return (
							<Box key={item.key}>
								<Text color="red"> ↳ ✗ </Text>
								<Text color="red">
									{basename(result.file)} still failed after retry
								</Text>
							</Box>
						);
					}

					const { result, willRetry } = item;
					return (
						<Box key={item.key} flexDirection="column">
							<CompletedFile result={result} willRetry={willRetry} />
							{result.tests
								.filter((t: IndividualTest) => t.status === "failed")
								.map((t: IndividualTest) => (
									<FailedTest
										key={`${result.file}-${t.name}`}
										test={t}
										isWarning={willRetry}
									/>
								))}
						</Box>
					);
				}}
			</Static>

			{/* Dynamic section below — only this part re-renders */}
			<Text dimColor>{"─".repeat(60)}</Text>

			{/* Running files */}
			{runningFiles.length > 0 && (
				<Box flexDirection="column">
					{runningFiles.map((r) => (
						<RunningFile key={r.file} result={r} />
					))}
				</Box>
			)}

			{/* Actively retrying */}
			{retryingFiles.length > 0 && (
				<Box flexDirection="column">
					{retryingFiles.map((r) => (
						<RetryingFile key={r.file} result={r} />
					))}
				</Box>
			)}

			{/* Progress */}
			<Box>
				{!isComplete && <Spinner />}
				{isComplete && <Text color="green">✓</Text>}
				<Text>
					{" "}
					<Text bold>
						{completedFiles.length}/{testFiles.length}
					</Text>{" "}
					| <Text color="green">✓ {passedTests.length}</Text> |{" "}
					<Text color={failedTests.length > 0 ? "red" : undefined}>
						✗ {failedTests.length}
					</Text>
					{runningFiles.length > 0 && (
						<Text dimColor> | {runningFiles.length} running</Text>
					)}
					{retryingFiles.length > 0 && (
						<Text color="yellow"> | {retryingFiles.length} retrying</Text>
					)}
				</Text>
			</Box>

			{/* Final summary when complete */}
			{isComplete && (
				<Box flexDirection="column" marginTop={1}>
					<FinalSummary results={allResults} />
				</Box>
			)}
		</Box>
	);
}

interface FinalSummaryProps {
	results: TestFileResult[];
}

function FinalSummary({ results }: FinalSummaryProps) {
	const allTests = results.flatMap((r) => r.tests);
	const passedTests = allTests.filter((t) => t.status === "passed");
	const failedTests = allTests.filter((t) => t.status === "failed");
	const failedFiles = results.filter((r) => r.status === "failed");
	const passedOnRetryFiles = results.filter((r) => r.passedOnRetry);
	const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

	// Files that failed with 0 tests (e.g. import errors, process crashes)
	const crashedFiles = failedFiles.filter((r) => r.tests.length === 0);

	const failedByFile = new Map<string, IndividualTest[]>();
	for (const result of results) {
		const fileFailed = result.tests.filter((t) => t.status === "failed");
		if (fileFailed.length > 0) {
			failedByFile.set(result.file, fileFailed);
		}
	}

	const hasAnyFailure = failedFiles.length > 0;

	if (!hasAnyFailure) {
		const retryText =
			passedOnRetryFiles.length > 0
				? ` (${passedOnRetryFiles.length} on retry)`
				: "";
		return (
			<Box flexDirection="column">
				<Text color="green" bold>
					{"═".repeat(60)}
				</Text>
				<Text color="green" bold>
					✓ ALL {passedTests.length} TESTS PASSED{retryText} (
					{(totalDuration / 1000).toFixed(1)}s)
				</Text>
				<Text color="green" bold>
					{"═".repeat(60)}
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="red" bold>
				{"═".repeat(60)}
			</Text>
			<Text color="red" bold>
				FAILED ({failedTests.length} test{failedTests.length !== 1 ? "s" : ""},{" "}
				{failedFiles.length} file{failedFiles.length !== 1 ? "s" : ""})
			</Text>
			<Text color="red" bold>
				{"═".repeat(60)}
			</Text>

			{crashedFiles.map((result) => (
				<Box key={result.file} flexDirection="column" marginTop={1}>
					<Text color="red" bold>
						📁 {basename(result.file)}
					</Text>
					<Text dimColor>{"─".repeat(50)}</Text>
					<Box marginLeft={2} flexDirection="column">
						<Text color="red">
							{" "}
							✗ File produced 0 tests (likely import/module error or process
							crash)
						</Text>
						{result.crashError && (
							<Text color="yellow"> {result.crashError}</Text>
						)}
					</Box>
				</Box>
			))}

			{Array.from(failedByFile.entries()).map(([file, tests]) => (
				<Box key={file} flexDirection="column" marginTop={1}>
					<Text color="red" bold>
						📁 {basename(file)}
					</Text>
					<Text dimColor>{"─".repeat(50)}</Text>

					{tests.map((test) => (
						<Box key={test.name} flexDirection="column" marginTop={1}>
							<Text color="red"> ✗ {test.name}</Text>
							{test.error?.location && (
								<Text color="cyan">
									{" "}
									{toClickablePath(test.error.location)}
								</Text>
							)}
							{test.error?.message && (
								<Text color="yellow"> {test.error.message}</Text>
							)}
						</Box>
					))}
				</Box>
			))}

			<Text> </Text>
			<Text color="red" bold>
				{"═".repeat(60)}
			</Text>
			<Text bold>
				SUMMARY: <Text color="green">{passedTests.length} passed</Text> |{" "}
				<Text color="red">{failedTests.length} failed</Text>
				{crashedFiles.length > 0 && (
					<Text color="red"> | {crashedFiles.length} crashed</Text>
				)}{" "}
				| {(totalDuration / 1000).toFixed(1)}s
			</Text>
			<Text color="red" bold>
				{"═".repeat(60)}
			</Text>
		</Box>
	);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
	const args = process.argv.slice(2);
	const directories: string[] = [];
	let maxParallel = process.env.TEST_FILE_CONCURRENCY
		? Number.parseInt(process.env.TEST_FILE_CONCURRENCY, 10)
		: testRunConfig.legacyConcurrency;
	let verbose = process.env.TEST_VERBOSE === "1";

	for (const arg of args) {
		if (arg.startsWith("--max=")) {
			const maxValue = arg.split("=")[1];
			maxParallel = maxValue
				? Number.parseInt(maxValue, 10)
				: testRunConfig.legacyConcurrency;
		} else if (arg === "--verbose" || arg === "-v") {
			verbose = true;
		} else if (arg.startsWith("-")) {
			console.error(`Unknown option: ${arg}`);
			console.log(
				"Usage: bun scripts/testScripts/runTestsV2.tsx <path1> [path2] [...] [--max=N] [--verbose]",
			);
			process.exit(1);
		} else {
			// Try to resolve the path in order of priority:
			// 1. Exact path from cwd (file or directory)
			// 2. Path under INTEGRATION_TEST_BASE
			// 3. Search for folder/file name within INTEGRATION_TEST_BASE
			let resolvedPath = arg;
			const fullPath = resolve(process.cwd(), arg);

			if (!existsSync(fullPath)) {
				const withBase = `${INTEGRATION_TEST_BASE}/${arg}`;
				const withBaseFull = resolve(process.cwd(), withBase);
				if (existsSync(withBaseFull)) {
					resolvedPath = withBase;
				} else {
					// Search for a matching folder or file under INTEGRATION_TEST_BASE
					const baseFullPath = resolve(process.cwd(), INTEGRATION_TEST_BASE);

					if (arg.endsWith(".test.ts")) {
						const found = await findFileByPath(baseFullPath, arg);
						if (found) {
							resolvedPath = found.replace(`${process.cwd()}/`, "");
						}
					} else {
						const found = await findFolderByPath(baseFullPath, arg);
						if (found) {
							resolvedPath = found.replace(`${process.cwd()}/`, "");
						}
					}
				}
			}

			directories.push(resolvedPath);
		}
	}

	if (directories.length === 0) {
		console.error("Error: No test paths specified");
		console.log(
			"Usage: bun scripts/testScripts/runTestsV2.tsx <path1> [path2] [...] [--max=N]",
		);
		process.exit(1);
	}

	const testFiles = await collectTestFiles(directories);

	if (testFiles.length === 0) {
		console.log("No test files found in specified directories");
		return;
	}

	render(
		<TestRunnerApp
			testFiles={testFiles}
			maxParallel={maxParallel}
			verbose={verbose}
		/>,
	);
}

main();
