import type * as groupsModule from "@tests/_groups/index.ts";

export type TestGroupsModule = Pick<
	typeof groupsModule,
	"getAllGroups" | "getAllSuites" | "resolveTestPaths"
>;

export type TestTree = {
	sha: string;
	testsDir: string;
	groups: TestGroupsModule;
};
