/**
 * Parses test output to extract structured failure information
 */

export type TestFailure = {
	testFile: string;
	testName: string;
	errorMessage: string;
	errorLocation?: string;
	stackTrace?: string;
};

export type TestSummary = {
	totalFiles: number;
	passedFiles: number;
	failedFiles: number;
	totalTests: number;
	passedTests: number;
	failedTests: number;
	failures: TestFailure[];
	duration: string;
};

/**
 * Parses bun test output to extract failure information
 */
export function parseTestOutput(output: string): TestSummary {
	const lines = output.split("\n");
	const failures: TestFailure[] = [];

	let totalFiles = 0;
	let failedFiles = 0;
	let totalTests = 0;
	let passedTests = 0;
	let failedTests = 0;
	let duration = "0s";

	// Extract summary statistics
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Match: "Ran X tests across Y file(s). [Zs]"
		const ranMatch = line.match(/Ran (\d+) tests across (\d+) file/);
		if (ranMatch) {
			totalTests += Number.parseInt(ranMatch[1]);
			totalFiles += Number.parseInt(ranMatch[2]);
		}

		// Match: "X pass"
		const passMatch = line.match(/^\s*(\d+) pass/);
		if (passMatch) {
			passedTests += Number.parseInt(passMatch[1]);
		}

		// Match: "X fail"
		const failMatch = line.match(/^\s*(\d+) fail/);
		if (failMatch) {
			failedTests += Number.parseInt(failMatch[1]);
		}

		// Match duration in summary
		const durationMatch = line.match(/\[(\d+\.\d+s)\]/);
		if (durationMatch) {
			duration = durationMatch[1];
		}
	}

	passedFiles = totalFiles - failedFiles;

	// Extract failure details
	let currentTestFile = "";
	const inFailureSection = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Detect test file being processed
		const fileMatch = line.match(/tests\/[\w/.-]+\.test\.ts:/);
		if (fileMatch) {
			currentTestFile = fileMatch[0].replace(":", "");
		}

		// Detect failure markers
		if (line.includes("(fail)")) {
			const failMatch = line.match(/\(fail\)\s+(.+?)\s+\[(\d+\.\d+ms)\]/);
			if (failMatch) {
				const testName = failMatch[1];

				// Look backwards for error message
				let errorMessage = "";
				let errorLocation = "";

				for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
					const prevLine = lines[j];

					// Find the error line (starts with "error:")
					if (prevLine.startsWith("error:")) {
						errorMessage = prevLine.replace("error:", "").trim();
						break;
					}
				}

				// Look forward for stack trace location
				for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
					const nextLine = lines[j];
					if (nextLine.includes("at ") && nextLine.includes(".ts:")) {
						errorLocation = nextLine.trim();
						break;
					}
				}

				failures.push({
					testFile: currentTestFile,
					testName,
					errorMessage,
					errorLocation,
				});

				if (currentTestFile && !failedFiles) {
					failedFiles++;
				}
			}
		}
	}

	// Calculate failed files from failures
	const uniqueFailedFiles = new Set(failures.map((f) => f.testFile));
	failedFiles = uniqueFailedFiles.size;
	passedFiles = totalFiles - failedFiles;

	return {
		totalFiles,
		passedFiles,
		failedFiles,
		totalTests,
		passedTests,
		failedTests,
		failures,
		duration,
	};
}
