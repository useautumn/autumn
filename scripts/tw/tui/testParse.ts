/**
 * Pure Bun-test-output parsers for the opentui swarm TUI. Deliberately a small
 * COPY of the equivalents in `scripts/testScripts/runTestsV2.tsx` rather than a
 * shared import — `bun t`'s Ink runner must stay byte-for-byte untouched, so the
 * swarm front-end carries its own copy. No JSX / framework deps.
 */

export type ParsedTest = {
	name: string;
	status: "passed" | "failed";
	duration?: number;
	error?: { message: string; location?: string };
};

const PASS_LINE = /^\(pass\)\s+(.+?)\s+\[(\d+(?:\.\d+)?m?s)\]/;
const FAIL_LINE = /^\(fail\)\s+(.+?)\s+\[(\d+(?:\.\d+)?m?s)\]/;
const PASS_OR_FAIL_NAME = /^\((?:pass|fail)\)\s+(.+?)\s+\[/;
const ERROR_LINE = /^error:\s*(.+)/i;
const EXPECTED_LINE = /Expected:\s*(.+)/;
const RECEIVED_LINE = /Received:\s*(.+)/;
const STACK_LINE = /at\s+.*?\(([^)]+\.ts):(\d+):(\d+)\)/;

export const parseDuration = (duration: string): number => {
	if (duration.endsWith("ms")) {
		return Number.parseFloat(duration);
	}
	if (duration.endsWith("s")) {
		return Number.parseFloat(duration) * 1000;
	}
	return Number.parseFloat(duration);
};

const parseErrorFromLines = (
	test: ParsedTest,
	errorLines: string[],
	filePath: string,
): void => {
	const errorText = errorLines.join("\n");

	let errorMessage = "";
	for (const line of errorLines) {
		const errorMatch = line.match(ERROR_LINE);
		if (errorMatch?.[1]) {
			errorMessage = errorMatch[1].trim();
			break;
		}
	}

	const expectedMatch = errorText.match(EXPECTED_LINE);
	const receivedMatch = errorText.match(RECEIVED_LINE);
	if (expectedMatch?.[1] && receivedMatch?.[1]) {
		errorMessage = `Expected: ${expectedMatch[1]}, Received: ${receivedMatch[1]}`;
	}

	if (errorText.includes("this test timed out")) {
		errorMessage = "Test timed out";
	}

	let location: string | undefined;
	for (const line of errorLines) {
		const stackMatch = line.match(STACK_LINE);
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

	test.error = {
		message: errorMessage || "Test failed",
		location: location ?? filePath,
	};
};

export const parseTestOutput = (
	output: string,
	filePath: string,
): ParsedTest[] => {
	const tests: ParsedTest[] = [];
	const lines = output.split("\n");
	let lastTestEndIndex = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) {
			continue;
		}

		const passMatch = line.match(PASS_LINE);
		const failMatch = line.match(FAIL_LINE);

		if (passMatch) {
			tests.push({
				name: (passMatch[1] ?? "").trim(),
				status: "passed",
				duration: parseDuration(passMatch[2] ?? "0ms"),
			});
			lastTestEndIndex = i;
		} else if (failMatch) {
			const errorLines = lines.slice(lastTestEndIndex + 1, i);
			const test: ParsedTest = {
				name: (failMatch[1] ?? "").trim(),
				status: "failed",
				duration: parseDuration(failMatch[2] ?? "0ms"),
			};
			parseErrorFromLines(test, errorLines, filePath);
			tests.push(test);
			lastTestEndIndex = i;
		}
	}

	return tests;
};

export const extractCurrentTest = (output: string): string | null => {
	const lines = output.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (!line) {
			continue;
		}
		const match = line.match(PASS_OR_FAIL_NAME);
		if (match?.[1]) {
			return match[1].trim();
		}
	}
	return null;
};
