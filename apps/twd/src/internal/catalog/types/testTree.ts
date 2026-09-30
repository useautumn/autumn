import type * as groupsModule from "@tests/_groups/index.ts";

/** The `_groups` exports twd relies on; loaded from the tree, typed by twd's checkout. */
export type TestGroupsModule = Pick<
	typeof groupsModule,
	"getAllGroups" | "getAllSuites" | "resolveTestPaths"
>;

/** `server/tests` as of one commit: `testsDir` is its absolute root on disk. */
export type TestTree = {
	sha: string;
	testsDir: string;
	groups: TestGroupsModule;
};
