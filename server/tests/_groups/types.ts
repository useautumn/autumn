export type TestTier = "core" | "domain";

export type TestGroup = {
	name: string;
	description: string;
	tier: TestTier;
	/** Directory paths relative to server/tests/. Resolved recursively for all *.test.ts files. */
	paths: string[];
	/** Override the default concurrency for this group. */
	maxConcurrency?: number;
};

export type TestSuite = {
	name: string;
	description: string;
	/** Group names to include when running this suite. */
	groups: string[];
};
