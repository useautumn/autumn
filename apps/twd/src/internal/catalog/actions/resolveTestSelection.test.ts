import { expect, mock, test } from "bun:test";
import * as testGroups from "@tests/_groups/index.ts";
import { groupSelectsTestId, TESTS_DIR } from "../repoPaths.ts";

mock.module("./getTestTreeAtSha.ts", () => ({
	getTestTreeAtSha: async () => ({
		sha: "head",
		testsDir: TESTS_DIR,
		groups: testGroups,
	}),
}));
const { resolveTestSelection } = await import("./resolveTestSelection.ts");

const select = (selection: { groups?: string[]; files?: string[] }) =>
	resolveTestSelection({ ctx: {} as never, sha: "head", selection });
const isUnit = (file: string) => file.startsWith("unit/");

test("only the unit group selects unit files", () => {
	expect(groupSelectsTestId({ group: "all", testId: "unit/a.test.ts" })).toBe(
		false,
	);
	expect(groupSelectsTestId({ group: "unit", testId: "unit/a.test.ts" })).toBe(
		true,
	);
	expect(
		groupSelectsTestId({ group: "all", testId: "integration/a.test.ts" }),
	).toBe(true);
});

test("all (what baselines run) drops every unit file", async () => {
	const files = await select({ groups: ["all"] });
	expect(files.some(isUnit)).toBe(false);
	expect(files.length).toBeGreaterThan(2_000);
});

test("all-domain and groups that list unit paths drop them too", async () => {
	for (const group of ["all-domain", "discounts", "sync"])
		expect((await select({ groups: [group] })).some(isUnit)).toBe(false);
});

test("the unit group runs exactly the unit files", async () => {
	const files = await select({ groups: ["unit"] });
	expect(files.length).toBeGreaterThan(0);
	expect(files.every(isUnit)).toBe(true);
});

test("an explicit unit path still runs", async () => {
	expect(await select({ files: ["unit/admin"] })).not.toHaveLength(0);
	expect(
		await select({
			files: [
				"server/tests/unit/billing/is-autumn-managed-subscription-metadata.test.ts",
			],
		}),
	).toEqual(["unit/billing/is-autumn-managed-subscription-metadata.test.ts"]);
});

test("all plus unit is the whole runnable tree", async () => {
	const [all, unit, both] = await Promise.all([
		select({ groups: ["all"] }),
		select({ groups: ["unit"] }),
		select({ groups: ["all", "unit"] }),
	]);
	expect(both.length).toBe(all.length + unit.length);
});
