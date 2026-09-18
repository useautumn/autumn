import { expect, test } from "bun:test";
import { locateFixture } from "../src/actions/pull/locateFixture";

test("unique lookup rejects duplicate public IDs across files but default keeps first match", () => {
	const params = {
		configPath: "/config.ts",
		files: new Map([
			["/config.ts", `fixture({ id: 'one' })`],
			["/other.ts", `fixture({ id: 'one' })`],
		]),
		builder: "fixture",
		idField: "id",
		id: "one",
	};
	expect(locateFixture(params)?.file).toBe("/config.ts");
	expect(locateFixture({ ...params, requireUnique: true })).toBeNull();
});

test("ambiguous stable IDs do not fall back to an otherwise unique public ID", () => {
	expect(
		locateFixture({
			configPath: "/config.ts",
			files: new Map([
				["/config.ts", `fixture({ id: 'one', internalId: 'stable' })`],
				["/other.ts", `fixture({ id: 'two', internalId: 'stable' })`],
			]),
			builder: "fixture",
			idField: "id",
			id: "one",
			internalId: "stable",
			requireUnique: true,
		}),
	).toBeNull();
});

test("a unique stable ID wins over duplicate public IDs", () => {
	expect(
		locateFixture({
			configPath: "/config.ts",
			files: new Map([
				["/config.ts", `fixture({ id: 'one' })`],
				["/other.ts", `fixture({ id: 'one', internalId: 'stable' })`],
			]),
			builder: "fixture",
			idField: "id",
			id: "one",
			internalId: "stable",
			requireUnique: true,
		})?.file,
	).toBe("/other.ts");
});

test("an absent stable ID falls back to a unique public ID", () => {
	expect(
		locateFixture({
			configPath: "/config.ts",
			files: new Map([["/config.ts", `fixture({ id: 'one' })`]]),
			builder: "fixture",
			idField: "id",
			id: "one",
			internalId: "absent",
			requireUnique: true,
		})?.idField,
	).toBe("id");
});

test("overlapping shapes deduplicate the same source node", () => {
	expect(
		locateFixture({
			configPath: "/config.ts",
			files: new Map([
				["/config.ts", `parent({ children: [fixture({ id: 'one' })] })`],
			]),
			builder: [
				"fixture",
				{ parentBuilder: "parent", arrayProperty: "children" },
			],
			idField: "id",
			id: "one",
			requireUnique: true,
		})?.node.text(),
	).toBe(`fixture({ id: 'one' })`);
});

test("distinct matching nodes in one file remain ambiguous", () => {
	expect(
		locateFixture({
			configPath: "/config.ts",
			files: new Map([
				["/config.ts", `fixture({ id: 'one' }); fixture({ id: 'one' })`],
			]),
			builder: "fixture",
			idField: "id",
			id: "one",
			requireUnique: true,
		}),
	).toBeNull();
});
