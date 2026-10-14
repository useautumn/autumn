#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Box, render, Static, Text, useApp } from "ink";
import pLimit from "p-limit";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	LocalExecutor,
	runningProcesses,
	type TestExecutor,
	WorkerDeathError,
} from "./testExecutor";
import { testRunConfig } from "./testRunConfig";

const MAX_WORKER_DEATH_RESCHEDULES = 5;

const INTEGRATION_TEST_BASE = testRunConfig.testsBaseDir;

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
	} catch {}
	return null;
}

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
	} catch {}
	return null;
}

const localSigintHandler = (): void => {
	for (const proc of runningProcesses) {
		try {
			proc.kill(9);
		} catch {}
	}
	runningProcesses.clear();

	console.log("\n\n⚠️  Tests interrupted by user (Ctrl+C)\n");
	process.exit(130);
};

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
	firstAttemptFailures?: IndividualTest[];
	currentTest?: string;
	duration: number;
	attempt: number;
	passedOnRetry: boolean;
	crashError?: string;
}

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

	let errorMessage = "";
	for (const line of errorLines) {
		const errorMatch = line.match(/^error:\s*(.+)/i);
		if (errorMatch?.[1]) {
			errorMessage = errorMatch[1].trim();
			break;
		}
	}

	const expectedMatch = errorText.match(/Expected:\s*(.+)/);
	const receivedMatch = errorText.match(/Received:\s*(.+)/);
	if (expectedMatch?.[1] && receivedMatch?.[1]) {
		errorMessage = `Expected: ${expectedMatch[1]}, Received: ${receivedMatch[1]}`;
	}

	if (errorText.includes("this test timed out")) {
		errorMessage = "Test timed out";
	}

	let location: string | undefined;

	for (const line of errorLines) {
		const stackMatch = line.match(/at\s+.*?\(([^)]+\.ts):(\d+):(\d+)\)/);
		const matchedFile = stackMatch?.[1];
		const lineNum = stackMatch?.[2];
		const colNum = stackMatch?.[3];
		if (matchedFile && lineNum && colNum) {
			if (matchedFile.endsWith(".test.ts")) {
				location = `${matchedFile}:${lineNum}:${colNum}`;
				break;
			}

			if (!location && matchedFile.includes("/server/")) {
				location = `${matchedFile}:${lineNum}:${colNum}`;
			}
		}
	}

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

		if (p.endsWith(".test.ts") && existsSync(resolved)) {
			testFiles.push(resolved);
			continue;
		}

		await collectRecursive(resolved);
	}

	return [...new Set(testFiles)];
}

async function runTestFile({
	file,
	onUpdate,
	attempt = 1,
	failedTestNames,
	verbose = false,
	executor,
	signal,
}: {
	file: string;
	onUpdate: (result: TestFileResult) => void;
	attempt?: number;
	failedTestNames?: string[];
	verbose?: boolean;
	executor: TestExecutor;
	signal?: AbortSignal;
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

	let output = "";
	const fileLabel = basename(file);

	const onChunk = (text: string): void => {
		output += text;

		if (verbose) {
			process.stderr.write(`[${fileLabel}] ${text}`);
		}

		const tests = parseTestOutput(output, file);
		const currentTest = extractCurrentTest(output);

		onUpdate({
			...result,
			tests,
			currentTest: currentTest || undefined,
		});
	};

	try {
		const { exitCode, stderr } = await executor.run({
			file,
			failedTestNames,
			onChunk,
			signal,
		});

		const duration = performance.now() - startTime;

		const tests = parseTestOutput(output, file);
		const hasFailures = tests.some((t) => t.status === "failed");
		const hasNoTests = tests.length === 0;
		const processExitedNonZero = exitCode !== 0;

		const isFailed = hasFailures || processExitedNonZero;

		const finalResult: TestFileResult = {
			file,
			status: isFailed ? "failed" : "passed",
			tests,
			duration,
			attempt,
			passedOnRetry: false,
			crashError:
				hasNoTests && stderr.trim() ? stderr.trim().slice(0, 1000) : undefined,
		};

		onUpdate(finalResult);
		return finalResult;
	} catch (error) {
		if (error instanceof WorkerDeathError) {
			throw error;
		}

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

interface SwarmRunMeta {
	target: string;
	workers: number;
	logFile: string;
}

interface TestRunnerAppProps {
	testFiles: string[];
	maxParallel: number;
	verbose: boolean;
	executor: TestExecutor;
	swarm?: SwarmRunMeta;
	onComplete: (exitCode: number) => void;
}

function TestRunnerApp({
	testFiles,
	maxParallel,
	verbose,
	executor,
	swarm,
	onComplete,
}: TestRunnerAppProps) {
	const { exit } = useApp();

	const pendingRef = useRef<Map<string, TestFileResult>>(new Map());
	const dirtyRef = useRef(false);

	const [results, setResults] = useState<Map<string, TestFileResult>>(
		new Map(),
	);
	const [isComplete, setIsComplete] = useState(false);

	const emittedFilesRef = useRef<Set<string>>(new Set());
	const [staticItems, setStaticItems] = useState<StaticItem[]>([]);

	const retryPhaseCompleteRef = useRef(false);

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

	useEffect(() => {
		const interval = setInterval(() => {
			if (!dirtyRef.current) return;
			dirtyRef.current = false;

			const snapshot = new Map<string, TestFileResult>(pendingRef.current);
			setResults(snapshot);

			const newStatic: StaticItem[] = [];
			for (const [file, result] of snapshot.entries()) {
				if (result.status === "passed" && !emittedFilesRef.current.has(file)) {
					emittedFilesRef.current.add(file);
					newStatic.push({ key: file, type: "result", result });
				}
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

	const updateResult = useCallback((result: TestFileResult) => {
		pendingRef.current.set(result.file, result);
		dirtyRef.current = true;
	}, []);

	useEffect(() => {
		const runAllTests = async () => {
			const limit = pLimit(maxParallel);

			const runWithReschedule = async (params: {
				limit: ReturnType<typeof pLimit>;
				file: string;
				attempt: number;
				failedTestNames?: string[];
			}): Promise<TestFileResult> => {
				let lastWorkerDeath: WorkerDeathError | undefined;
				for (
					let rescheduleCount = 0;
					rescheduleCount <= MAX_WORKER_DEATH_RESCHEDULES;
					rescheduleCount++
				) {
					try {
						return await params.limit(() =>
							runTestFile({
								file: params.file,
								onUpdate: updateResult,
								attempt: params.attempt,
								failedTestNames: params.failedTestNames,
								verbose,
								executor,
							}),
						);
					} catch (error) {
						if (!(error instanceof WorkerDeathError)) {
							throw error;
						}
						lastWorkerDeath = error;
					}
				}

				const cappedResult: TestFileResult = {
					file: params.file,
					status: "failed",
					tests: [],
					duration: 0,
					attempt: params.attempt,
					passedOnRetry: false,
					crashError: `Worker died repeatedly (>${MAX_WORKER_DEATH_RESCHEDULES} reschedules): ${
						lastWorkerDeath?.message ?? "worker death"
					}`,
				};
				updateResult(cappedResult);
				return cappedResult;
			};

			const promises = testFiles.map((file) =>
				runWithReschedule({ limit, file, attempt: 1 }),
			);

			await Promise.all(promises);

			const allPendingResults: TestFileResult[] = Array.from(
				pendingRef.current.values(),
			);
			const failedFiles = allPendingResults.filter(
				(r) => r.status === "failed" && r.attempt === 1,
			);

			if (failedFiles.length > 0) {
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

				const retryLimit = pLimit(maxParallel);
				const retryPromises = failedFiles.map(async (result) => {
					const firstAttemptFailures = result.tests.filter(
						(t) => t.status === "failed",
					);
					const failedTestNames: string[] = [];

					const retryingResult: TestFileResult = {
						...result,
						status: "retrying",
						firstAttemptFailures,
					};
					pendingRef.current.set(result.file, retryingResult);
					dirtyRef.current = true;

					const retryResult = await runWithReschedule({
						limit: retryLimit,
						file: result.file,
						attempt: 2,
						failedTestNames,
					});
					if (retryResult.status === "passed") {
						retryResult.passedOnRetry = true;
					}
					retryResult.firstAttemptFailures = firstAttemptFailures;
					pendingRef.current.set(result.file, retryResult);
					dirtyRef.current = true;
					return retryResult;
				});

				await Promise.all(retryPromises);
			}

			retryPhaseCompleteRef.current = true;

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
	}, [testFiles, maxParallel, updateResult, verbose, executor]);

	useEffect(() => {
		if (!isComplete) return;

		const exitResults: TestFileResult[] = Array.from(results.values());
		const exitFailedFiles = exitResults.some((r) => r.status === "failed");

		const timer = setTimeout(() => {
			exit();
			onComplete(exitFailedFiles ? 1 : 0);
		}, 100);
		return () => clearTimeout(timer);
	}, [isComplete, results, exit, onComplete]);

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
								.map((t: IndividualTest, index: number) => (
									<FailedTest
										key={`${result.file}-${t.name}-${index}`}
										test={t}
										isWarning={willRetry}
									/>
								))}
						</Box>
					);
				}}
			</Static>

			{swarm && (
				<Text>
					<Text bold color="cyan">
						swarm
					</Text>
					<Text dimColor>
						{" "}
						{swarm.target} · {swarm.workers} worker
						{swarm.workers === 1 ? "" : "s"}
					</Text>
				</Text>
			)}
			<Text dimColor>{"─".repeat(60)}</Text>

			{runningFiles.length > 0 && (
				<Box flexDirection="column">
					{runningFiles.map((r) => (
						<RunningFile key={r.file} result={r} />
					))}
				</Box>
			)}

			{retryingFiles.length > 0 && (
				<Box flexDirection="column">
					{retryingFiles.map((r) => (
						<RetryingFile key={r.file} result={r} />
					))}
				</Box>
			)}

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

			{isComplete && (
				<Box flexDirection="column" marginTop={1}>
					<FinalSummary results={allResults} swarm={swarm} />
				</Box>
			)}
		</Box>
	);
}

interface FinalSummaryProps {
	results: TestFileResult[];
	swarm?: SwarmRunMeta;
}

function FinalSummary({ results, swarm }: FinalSummaryProps) {
	const allTests = results.flatMap((r) => r.tests);
	const passedTests = allTests.filter((t) => t.status === "passed");
	const failedTests = allTests.filter((t) => t.status === "failed");
	const failedFiles = results.filter((r) => r.status === "failed");
	const passedOnRetryFiles = results.filter((r) => r.passedOnRetry);
	const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

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
				{swarm && <SwarmLogHint logFile={swarm.logFile} />}
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

					{tests.map((test, index) => (
						<Box
							key={`${test.name}-${index}`}
							flexDirection="column"
							marginTop={1}
						>
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
			{swarm && <SwarmLogHint logFile={swarm.logFile} />}
		</Box>
	);
}

function SwarmLogHint({ logFile }: { logFile: string }) {
	return <Text dimColor>full run log: {logFile}</Text>;
}

const formatDuration = (ms: number) =>
	ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

async function runHeadlessWithExecutor(
	testFiles: string[],
	executor: TestExecutor,
	opts: { maxParallel: number; verbose?: boolean },
): Promise<number> {
	const { maxParallel, verbose = false } = opts;
	const startTime = performance.now();
	const results = new Map<string, TestFileResult>();

	const runWithReschedule = async ({
		limit,
		file,
		attempt,
		failedTestNames,
	}: {
		limit: ReturnType<typeof pLimit>;
		file: string;
		attempt: number;
		failedTestNames?: string[];
	}): Promise<TestFileResult> => {
		let lastWorkerDeath: WorkerDeathError | undefined;
		for (
			let rescheduleCount = 0;
			rescheduleCount <= MAX_WORKER_DEATH_RESCHEDULES;
			rescheduleCount++
		) {
			try {
				return await limit(() =>
					runTestFile({
						file,
						onUpdate: (result) => {
							results.set(result.file, result);
						},
						attempt,
						failedTestNames,
						verbose,
						executor,
					}),
				);
			} catch (error) {
				if (!(error instanceof WorkerDeathError)) throw error;
				lastWorkerDeath = error;
			}
		}

		const cappedResult: TestFileResult = {
			file,
			status: "failed",
			tests: [],
			duration: 0,
			attempt,
			passedOnRetry: false,
			crashError: `Worker died repeatedly (>${MAX_WORKER_DEATH_RESCHEDULES} reschedules): ${
				lastWorkerDeath?.message ?? "worker death"
			}`,
		};
		results.set(file, cappedResult);
		return cappedResult;
	};

	console.log(
		`Running ${testFiles.length} file(s) headless (max=${maxParallel})\n`,
	);

	const limit = pLimit(maxParallel);
	await Promise.all(
		testFiles.map((file) => runWithReschedule({ limit, file, attempt: 1 })),
	);

	const failedFirstPass = [...results.values()].filter(
		(result) => result.status === "failed" && result.attempt === 1,
	);

	if (failedFirstPass.length > 0) {
		console.log(`\nRetrying ${failedFirstPass.length} failed file(s)…\n`);
		const retryLimit = pLimit(maxParallel);
		await Promise.all(
			failedFirstPass.map(async (result) => {
				const firstAttemptFailures = result.tests.filter(
					(test) => test.status === "failed",
				);
				const retryResult = await runWithReschedule({
					limit: retryLimit,
					file: result.file,
					attempt: 2,
					failedTestNames: [],
				});
				if (retryResult.status === "passed") {
					retryResult.passedOnRetry = true;
				}
				retryResult.firstAttemptFailures = firstAttemptFailures;
				results.set(result.file, retryResult);
			}),
		);
	}

	const finalResults = [...results.values()];
	let passedTests = 0;
	let failedTests = 0;
	const failedFiles: TestFileResult[] = [];

	for (const result of finalResults) {
		const filePassed = result.tests.filter((test) => test.status === "passed");
		const fileFailed = result.tests.filter((test) => test.status === "failed");
		passedTests += filePassed.length;
		failedTests += fileFailed.length;

		if (result.status === "passed") {
			const retryNote = result.passedOnRetry ? " (passed on retry)" : "";
			console.log(
				`✓ ${basename(result.file)} (✓${filePassed.length}${retryNote}) [${formatDuration(result.duration)}]`,
			);
			continue;
		}

		failedFiles.push(result);
		console.log(
			`✗ ${basename(result.file)} (✓${filePassed.length} ✗${fileFailed.length || (result.crashError ? 1 : 0)}) [${formatDuration(result.duration)}]`,
		);
		if (result.crashError) {
			console.log(`  crash: ${result.crashError.split("\n")[0]}`);
		}
		for (const test of fileFailed) {
			console.log(`  ✗ ${test.name}`);
			if (test.error?.location) console.log(`    ${test.error.location}`);
			if (test.error?.message) console.log(`    ${test.error.message}`);
		}
	}

	const totalDuration = performance.now() - startTime;
	console.log(
		`\nSUMMARY: ${passedTests} passed | ${failedTests} failed | ${formatDuration(totalDuration)}`,
	);
	return failedFiles.length > 0 ? 1 : 0;
}

export function runWithExecutor(
	testFiles: string[],
	executor: TestExecutor,
	opts: {
		maxParallel: number;
		verbose?: boolean;
		headless?: boolean;
		swarm?: SwarmRunMeta;
	},
): void {
	const headless = opts.headless ?? false;

	if (headless) {
		void runHeadlessWithExecutor(testFiles, executor, {
			maxParallel: opts.maxParallel,
			verbose: opts.verbose,
		}).then((exitCode) => {
			process.exit(exitCode);
		});
		return;
	}

	const onComplete = (exitCode: number): void => {
		instance?.unmount();
		process.exit(exitCode);
	};

	const instance = render(
		<TestRunnerApp
			executor={executor}
			maxParallel={opts.maxParallel}
			onComplete={onComplete}
			swarm={opts.swarm}
			testFiles={testFiles}
			verbose={opts.verbose ?? false}
		/>,
	);
}

async function main() {
	const args = process.argv.slice(2);
	const directories: string[] = [];
	let maxParallel = process.env.TEST_FILE_CONCURRENCY
		? Number.parseInt(process.env.TEST_FILE_CONCURRENCY, 10)
		: testRunConfig.legacyConcurrency;
	let verbose = process.env.TEST_VERBOSE === "1";
	let headless =
		process.env.TEST_HEADLESS === "1" ||
		process.env.CI === "true" ||
		process.env.CI === "1" ||
		!process.stdout.isTTY;

	for (const arg of args) {
		if (arg.startsWith("--max=")) {
			const maxValue = arg.split("=")[1];
			maxParallel = maxValue
				? Number.parseInt(maxValue, 10)
				: testRunConfig.legacyConcurrency;
		} else if (arg === "--verbose" || arg === "-v") {
			verbose = true;
		} else if (arg === "--headless") {
			headless = true;
		} else if (arg === "--tui") {
			headless = false;
		} else if (arg.startsWith("-")) {
			console.error(`Unknown option: ${arg}`);
			console.log(
				"Usage: bun scripts/testScripts/runTestsV2.tsx <path1> [path2] [...] [--max=N] [--verbose] [--headless|--tui]",
			);
			process.exit(1);
		} else {
			let resolvedPath = arg;
			const fullPath = resolve(process.cwd(), arg);

			if (!existsSync(fullPath)) {
				const withBase = `${INTEGRATION_TEST_BASE}/${arg}`;
				const withBaseFull = resolve(process.cwd(), withBase);
				if (existsSync(withBaseFull)) {
					resolvedPath = withBase;
				} else {
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

	process.on("SIGINT", localSigintHandler);
	runWithExecutor(testFiles, new LocalExecutor(), {
		maxParallel,
		verbose,
		headless,
	});
}

if (import.meta.main) {
	main();
}
