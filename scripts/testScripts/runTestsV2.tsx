#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "bun";
import { Box, render, Static, Text, useApp } from "ink";
import pLimit from "p-limit";
import { useCallback, useEffect, useRef, useState } from "react";

// Base path for shorthand test paths
const INTEGRATION_TEST_BASE = "server/tests";

/**
 * Recursively search for a folder whose path ends with the given suffix.
 * e.g. searching for "attach/free-trial" will match ".../billing/attach/free-trial"
 * but NOT ".../update-subscription/free-trial".
 */
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
	currentTest?: string;
	duration: number;
	attempt: number;
	passedOnRetry: boolean;
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

		const passMatch = line.match(/^\(pass\)\s+(.+?)\s+\[(\d+(?:\.\d+)?m?s)\]/);
		const failMatch = line.match(/^\(fail\)\s+(.+?)\s+\[(\d+(?:\.\d+)?m?s)\]/);

		if (passMatch) {
			const [, name, duration] = passMatch;
			tests.push({
				name: name.trim(),
				status: "passed",
				duration: parseDuration(duration),
			});
			lastTestEndIndex = i;
		} else if (failMatch) {
			const [, name, duration] = failMatch;

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
		if (errorMatch) {
			errorMessage = errorMatch[1].trim();
			break;
		}
	}

	// Find Expected/Received for assertion errors
	const expectedMatch = errorText.match(/Expected:\s*(.+)/);
	const receivedMatch = errorText.match(/Received:\s*(.+)/);
	if (expectedMatch && receivedMatch) {
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
		if (stackMatch) {
			const matchedFile = stackMatch[1];
			const lineNum = stackMatch[2];
			const colNum = stackMatch[3];

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
		const match = lines[i].match(/^\((?:pass|fail)\)\s+(.+?)\s+\[/);
		if (match) {
			return match[1].trim();
		}
	}

	return null;
}

// ============================================================================
// Test Runner Logic
// ============================================================================

async function collectTestFiles(directories: string[]): Promise<string[]> {
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

	for (const dir of directories) {
		const resolvedDir = resolve(process.cwd(), dir);
		await collectRecursive(resolvedDir);
	}

	return testFiles;
}

async function runTestFile(
	file: string,
	onUpdate: (result: TestFileResult) => void,
	attempt = 1,
): Promise<TestFileResult> {
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
		const proc = spawn(["bun", "test", "--timeout", "0", file], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});

		// Track process for cleanup on SIGINT
		runningProcesses.add(proc);

		let output = "";
		const decoder = new TextDecoder();

		if (proc.stdout) {
			for await (const chunk of proc.stdout) {
				const text = decoder.decode(chunk);
				output += text;

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
				output += decoder.decode(chunk);
			}
		}

		await proc.exited;

		// Remove from tracking
		runningProcesses.delete(proc);

		const duration = performance.now() - startTime;

		const tests = parseTestOutput(output, file);
		const hasFailures = tests.some((t) => t.status === "failed");

		const finalResult: TestFileResult = {
			file,
			status: hasFailures ? "failed" : "passed",
			tests,
			duration,
			attempt,
			passedOnRetry: false,
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
			setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
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
}

function CompletedFile({ result }: CompletedFileProps) {
	const fileName = basename(result.file);
	const passedCount = result.tests.filter((t) => t.status === "passed").length;
	const failedCount = result.tests.filter((t) => t.status === "failed").length;

	const icon = result.status === "passed" ? "✓" : "✗";
	const iconColor = result.status === "passed" ? "green" : "red";
	const retryBadge = result.passedOnRetry ? " (retry)" : "";

	return (
		<Box>
			<Text color={iconColor}>{icon} </Text>
			<Text dimColor={result.status === "passed"}>
				{fileName}
				{retryBadge}{" "}
			</Text>
			<Text dimColor>
				(<Text color="green">✓{passedCount}</Text>
				{failedCount > 0 && <Text color="red"> ✗{failedCount}</Text>})
			</Text>
		</Box>
	);
}

interface FailedTestProps {
	test: IndividualTest;
}

function FailedTest({ test }: FailedTestProps) {
	return (
		<Box flexDirection="column" marginLeft={2}>
			<Box>
				<Text color="red"> ✗ </Text>
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
	queuedCount: number;
}

function RetryingFile({ result, queuedCount }: RetryingFileProps) {
	const fileName = basename(result.file);
	return (
		<Box>
			<Text> </Text>
			<Spinner />
			<Text color="yellow"> {fileName} </Text>
			<Text color="yellow">(retrying...)</Text>
			{queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
		</Box>
	);
}

interface TestRunnerAppProps {
	testFiles: string[];
	maxParallel: number;
}

function TestRunnerApp({ testFiles, maxParallel }: TestRunnerAppProps) {
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
	const [staticItems, setStaticItems] = useState<TestFileResult[]>([]);

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

			const snapshot = new Map(pendingRef.current);
			setResults(snapshot);

			// Emit newly-completed files to <Static>
			// Only emit passed files immediately; defer failed files until retry phase is complete
			const newStatic: TestFileResult[] = [];
			for (const [file, result] of snapshot) {
				if (emittedFilesRef.current.has(file)) continue;

				const shouldEmit =
					result.status === "passed" ||
					(result.status === "failed" && retryPhaseCompleteRef.current);

				if (shouldEmit) {
					emittedFilesRef.current.add(file);
					newStatic.push(result);
				}
			}
			if (newStatic.length > 0) {
				setStaticItems((prev) => [...prev, ...newStatic]);
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
				limit(() => runTestFile(file, updateResult, 1)),
			);

			await Promise.all(promises);

			// Phase 2: Retry failed files
			const failedFiles = Array.from(pendingRef.current.values()).filter(
				(r) => r.status === "failed" && r.attempt === 1,
			);

			if (failedFiles.length > 0) {
				// Mark all failed files as queued for retry
				for (const result of failedFiles) {
					const queuedResult: TestFileResult = {
						...result,
						status: "retry_queued",
					};
					pendingRef.current.set(result.file, queuedResult);
				}
				dirtyRef.current = true;

				// Run retries sequentially to avoid resource contention
				for (const result of failedFiles) {
					// Mark this specific file as actively retrying
					const retryingResult: TestFileResult = {
						...result,
						status: "retrying",
					};
					pendingRef.current.set(result.file, retryingResult);
					dirtyRef.current = true;

					const retryResult = await runTestFile(result.file, updateResult, 2);
					if (retryResult.status === "passed") {
						retryResult.passedOnRetry = true;
						pendingRef.current.set(result.file, retryResult);
						dirtyRef.current = true;
					}
				}
			}

			// Mark retry phase as complete so failed files can be emitted to static
			retryPhaseCompleteRef.current = true;

			// Final flush to ensure every completed result is captured
			const finalSnapshot = new Map(pendingRef.current);
			setResults(finalSnapshot);

			const newStatic: TestFileResult[] = [];
			for (const [file, result] of finalSnapshot) {
				if (
					(result.status === "passed" || result.status === "failed") &&
					!emittedFilesRef.current.has(file)
				) {
					emittedFilesRef.current.add(file);
					newStatic.push(result);
				}
			}
			if (newStatic.length > 0) {
				setStaticItems((prev) => [...prev, ...newStatic]);
			}

			setIsComplete(true);
		};

		if (testFiles.length > 0) {
			runAllTests();
		}
	}, [testFiles, maxParallel, updateResult]);

	// Exit when complete
	useEffect(() => {
		if (!isComplete) return;

		const allResults = Array.from(results.values());
		const failedTests = allResults.flatMap((r) =>
			r.tests.filter((t) => t.status === "failed"),
		);

		// Small delay to ensure final render
		setTimeout(() => {
			exit();
			process.exit(failedTests.length > 0 ? 1 : 0);
		}, 100);
	}, [isComplete, results, exit]);

	const allResults = Array.from(results.values());
	const runningFiles = allResults.filter((r) => r.status === "running");
	const retryingFiles = allResults.filter((r) => r.status === "retrying");
	const retryQueuedFiles = allResults.filter(
		(r) => r.status === "retry_queued",
	);

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
				{(result) => (
					<Box key={result.file} flexDirection="column">
						<CompletedFile result={result} />
						{result.tests
							.filter((t) => t.status === "failed")
							.map((t) => (
								<FailedTest key={`${result.file}-${t.name}`} test={t} />
							))}
					</Box>
				)}
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

			{/* Retrying file (only 1 at a time, show queued count) */}
			{retryingFiles.length > 0 && (
				<Box flexDirection="column">
					{retryingFiles.map((r) => (
						<RetryingFile
							key={r.file}
							result={r}
							queuedCount={retryQueuedFiles.length}
						/>
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
						<Text color="yellow"> | 1 retrying</Text>
					)}
					{retryQueuedFiles.length > 0 && (
						<Text dimColor> | {retryQueuedFiles.length} queued</Text>
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
	const passedOnRetryFiles = results.filter((r) => r.passedOnRetry);
	const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

	const failedByFile = new Map<string, IndividualTest[]>();
	for (const result of results) {
		const fileFailed = result.tests.filter((t) => t.status === "failed");
		if (fileFailed.length > 0) {
			failedByFile.set(result.file, fileFailed);
		}
	}

	if (failedTests.length === 0) {
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
				FAILED TESTS ({failedTests.length})
			</Text>
			<Text color="red" bold>
				{"═".repeat(60)}
			</Text>

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
				<Text color="red">{failedTests.length} failed</Text> |{" "}
				{(totalDuration / 1000).toFixed(1)}s
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
		: 6;

	for (const arg of args) {
		if (arg.startsWith("--max=")) {
			maxParallel = Number.parseInt(arg.split("=")[1], 10);
		} else if (arg.startsWith("-")) {
			console.error(`Unknown option: ${arg}`);
			console.log(
				"Usage: bun scripts/testScripts/runTestsV2.tsx <dir1> [dir2] [...] [--max=N]",
			);
			process.exit(1);
		} else {
			// Try to resolve the path in order of priority:
			// 1. Exact path from cwd
			// 2. Path under INTEGRATION_TEST_BASE
			// 3. Search for folder name within INTEGRATION_TEST_BASE
			let resolvedPath = arg;
			const fullPath = resolve(process.cwd(), arg);

			if (!existsSync(fullPath)) {
				const withBase = `${INTEGRATION_TEST_BASE}/${arg}`;
				const withBaseFull = resolve(process.cwd(), withBase);
				if (existsSync(withBaseFull)) {
					resolvedPath = withBase;
				} else {
					// Search for a folder whose path ends with the given arg
					const baseFullPath = resolve(process.cwd(), INTEGRATION_TEST_BASE);
					const found = await findFolderByPath(baseFullPath, arg);
					if (found) {
						// Convert back to relative path
						resolvedPath = found.replace(`${process.cwd()}/`, "");
					}
				}
			}

			directories.push(resolvedPath);
		}
	}

	if (directories.length === 0) {
		console.error("Error: No test directories specified");
		console.log(
			"Usage: bun scripts/testScripts/runTestsV2.tsx <dir1> [dir2] [...] [--max=N]",
		);
		process.exit(1);
	}

	const testFiles = await collectTestFiles(directories);

	if (testFiles.length === 0) {
		console.log("No test files found in specified directories");
		return;
	}

	render(<TestRunnerApp testFiles={testFiles} maxParallel={maxParallel} />);
}

main();
