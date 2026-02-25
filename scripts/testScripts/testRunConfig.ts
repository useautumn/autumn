/** Centralized config for the test runner. */

export const testRunConfig = {
	/** Default max parallel test files when run via `bun t`. */
	defaultConcurrency: 2,

	/** Max parallel when runTestsV2.tsx is invoked directly (legacy / shell scripts). */
	legacyConcurrency: 6,

	/** Default timeout per test (0 = no timeout, passed to `bun test --timeout`). */
	testTimeout: 0,

	/** Base directory for test files (relative to project root). */
	testsBaseDir: "server/tests",

	/** Directory containing legacy shell test scripts (relative to project root). */
	legacyScriptsDir: "scripts/testGroups",
};
