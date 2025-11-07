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
	// G1.sh test groups (48 test files)
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
	{
		slug: "downgrade",
		paths: ["tests/attach/downgrade"],
	},
	{
		slug: "free",
		paths: ["tests/attach/free"],
	},
	{
		slug: "addOn",
		paths: ["tests/attach/addOn"],
	},
	{
		slug: "entities",
		paths: ["tests/attach/entities"],
	},
	{
		slug: "checkout",
		paths: ["tests/attach/checkout"],
	},

	// G2.sh test groups (28+ test files)
	{
		slug: "migrations",
		paths: ["tests/attach/migrations"],
	},
	{
		slug: "newVersion",
		paths: ["tests/attach/newVersion"],
	},
	{
		slug: "upgradeOld",
		paths: ["tests/attach/upgradeOld"],
	},
	{
		slug: "others",
		paths: ["tests/attach/others"],
	},
	{
		slug: "updateEnts",
		paths: ["tests/attach/updateEnts"],
	},
	{
		slug: "prepaid",
		paths: ["tests/attach/prepaid"],
	},
	{
		slug: "advanced-check",
		paths: ["tests/advanced/check"],
	},
	{
		slug: "interval-upgrade",
		paths: ["tests/interval/upgrade"],
	},
	{
		slug: "interval-multiSub",
		paths: ["tests/interval/multiSub"],
	},

	// Debug single test - NEW MIGRATED VERSION
	// {
	// 	slug: "test-debug",
	// 	paths: ["tests/attach/basic/basic1.test.ts"],
	// },
];
