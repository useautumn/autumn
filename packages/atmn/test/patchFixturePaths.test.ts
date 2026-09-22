import { describe, expect, test } from "bun:test";
import { patchFixturePaths } from "../src/surgery/patchFixturePaths";

const patch = (
	source: string,
	assignments: { path: (string | number)[]; text: string | null }[],
) =>
	patchFixturePaths({
		source,
		builder: "fixture",
		idField: "id",
		id: "one",
		assignments,
	});

describe("patchFixturePaths", () => {
	test("equivalent literal assignments preserve multiline formatting and comments", () => {
		const source = `fixture({ id: 'one', mapping: {
  // Preserve this explanation.
  secondary: [1, true, null],
  primary: { 'key': 'existing' }, /* preserve this too */
} })`;
		expect(
			patch(source, [
				{
					path: ["mapping"],
					text: '{"primary":{"key":"existing"},"secondary":[1,true,null]}',
				},
			]),
		).toEqual({ source, skipped: [] });
	});

	test("adds a mapping inside a comment-only object without erasing comments", () => {
		const source = `fixture({ id: 'one', price: { /* manually explained */ } })`;
		expect(
			patch(source, [
				{ path: ["price", "processors"], text: '{"provider":{"id":"new"}}' },
			]),
		).toEqual({
			source: `fixture({ id: 'one', price: { /* manually explained */  "processors": {"provider":{"id":"new"}} } })`,
			skipped: [],
		});
	});
	test("uses caller-selected indices after reordering and preserves sibling bytes", () => {
		const source = `fixture({ id: 'one', rows: [
  { id: 'second', mapping: { live: 'old' }, custom: compute() }, // keep second
  { id: 'first', mapping: { live: 'other' } }, // keep first
], unrelated: expression() })`;
		const result = patch(source, [
			{ path: ["rows", 1, "mapping", "live"], text: "'new'" },
		]);
		expect(result).toEqual({
			source: source.replace("'other'", "'new'"),
			skipped: [],
		});
	});

	test("creates missing objects and reparses between assignments", () => {
		const result = patch(`fixture({ id: 'one', rows: [{}] })`, [
			{ path: ["rows", 0, "mapping", "live"], text: "'a'" },
			{ path: ["rows", 0, "mapping", "sandbox"], text: "'b'" },
		]);
		expect(result?.source).toContain(
			`"mapping": { "live": 'a', "sandbox": 'b' }`,
		);
		expect(result?.skipped).toEqual([]);
	});

	test("decodes quoted keys including the fixture selector", () => {
		const source = `fixture({ 'id': 'one', 'map\\u0070ing': { 'live-key': 'old' } })`;
		expect(
			patch(source, [{ path: ["mapping", "live-key"], text: "'new'" }])?.source,
		).toBe(source.replace("'old'", "'new'"));
	});

	test("preserves comments in empty containers and around deletions", () => {
		const source = `fixture({ id: 'one', mapping: { /* keep */ } })`;
		expect(
			patch(source, [{ path: ["mapping", "live"], text: "'new'" }])?.source,
		).toContain(`{ /* keep */  "live": 'new' }`);
		const deletion = `fixture({ id: 'one', mapping: { other: 'keep', /* before */ live: 'old' /* after */ } })`;
		expect(
			patch(deletion, [{ path: ["mapping", "live"], text: null }])?.source,
		).toBe(
			`fixture({ id: 'one', mapping: { other: 'keep' /* before */  /* after */ } })`,
		);
	});

	test.each([
		`fixture({ id: 'one', mapping: compute() })`,
		`fixture({ id: 'one', mapping: { ...rest, live: 'old' } })`,
		`fixture({ id: 'one', mapping: { [key]: 'old', live: 'old' } })`,
		`fixture({ id: 'one', mapping: { live: 'old', 'live': 'duplicate' } })`,
		`fixture({ id: 'one', mapping: { live: compute() } })`,
		`fixture({ id: 'one', mapping: { live } })`,
		`fixture({ id: 'one' }); fixture({ id: 'one' })`,
	])("refuses dynamic or ambiguous structures: %s", (source) => {
		const result = patch(source, [
			{ path: ["mapping", "live"], text: "'new'" },
		]);
		expect(result?.source).toBe(source);
		expect(result?.skipped).toHaveLength(1);
	});

	test.each(["[...rows]", "[{}, , {}]", "[]"])(
		"never invents array elements: %s",
		(rows) => {
			const source = `fixture({ id: 'one', rows: ${rows} })`;
			expect(
				patch(source, [{ path: ["rows", 1, "mapping", "live"], text: "'new'" }])
					?.skipped,
			).toHaveLength(1);
		},
	);

	test("keeps comment nodes out of array indices and supports explicit builder wrappers", () => {
		const source = `fixture({ id: 'one', rows: [/* first */ row({ value: 'old' }), other()] })`;
		const result = patchFixturePaths({
			source,
			builder: "fixture",
			idField: "id",
			id: "one",
			builders: ["row"],
			assignments: [{ path: ["rows", 0, "value"], text: "'new'" }],
		});
		expect(result).toEqual({
			source: source.replace("'old'", "'new'"),
			skipped: [],
		});
	});

	test("missing fixture is distinct from a skipped path", () => {
		expect(patch(`fixture({ id: 'other' })`, [])).toBeNull();
	});

	test("preserves shorthand siblings when appending a missing key", () => {
		expect(
			patch(`fixture({ id: 'one', mapping: { custom } })`, [
				{ path: ["mapping", "live"], text: "'new'" },
			]),
		).toEqual({
			source: `fixture({ id: 'one', mapping: { custom, "live": 'new' } })`,
			skipped: [],
		});
	});

	test("matches quoted constraints without confusing fixtures", () => {
		const source = `fixture({ id: 'one', 'version': 'v1' }); fixture({ id: 'one', 'version': 'v2' })`;
		const result = patchFixturePaths({
			source,
			builder: "fixture",
			idField: "id",
			id: "one",
			where: [{ field: "version", equals: "v2" }],
			assignments: [{ path: ["mapping"], text: "'new'" }],
		});
		expect(result).toEqual({
			source: source.replace(
				`'version': 'v2'`,
				`'version': 'v2', "mapping": 'new'`,
			),
			skipped: [],
		});
	});
});
