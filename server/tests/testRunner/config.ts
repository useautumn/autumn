/**
 * Test Groups Configuration
 *
 * Each test group runs under its own dedicated Autumn organization + Stripe Connect account.
 * This allows tests to run in parallel without rate limiting or data conflicts.
 */

export type TestGroup = {
	/** Unique org slug for this test group (e.g., "test-upgrade") */
	slug: string;
	/** Test paths to run - can be directories or specific test files */
	paths: string[];
};

export const testGroups: TestGroup[] = [
	{
		slug: "check-basic",
		paths: ["tests/check/basic"],
	},
	{
		slug: "basic",
		paths: ["tests/attach/basic"],
	},
	{
		slug: "upgrade",
		paths: ["tests/attach/upgrade"],
	},
	// {
	// 	slug: "checkout",
	// 	paths: ["tests/attach/checkout"],
	// },

	// Debug single test - NEW MIGRATED VERSION
	// {
	// 	slug: "test-debug",
	// 	paths: ["tests/attach/basic/basic1.test.ts"],
	// },
];
