export type TestTier = "core" | "domain";

export type TestGroup = {
	name: string;
	description: string;
	tier: TestTier;
	paths: string[];
	maxConcurrency?: number;
};

export type TestSuite = {
	name: string;
	description: string;
	groups: string[];
};
