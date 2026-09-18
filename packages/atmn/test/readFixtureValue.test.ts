import { expect, test } from "bun:test";
import { Lang, parse } from "@ast-grep/napi";
import {
	DYNAMIC_VALUE,
	readFixtureValue,
} from "../src/surgery/readFixtureValue";

const read = (text: string, builders?: readonly string[]) => {
	const node = parse(Lang.TypeScript, `const value = ${text}`)
		.root()
		.find({ rule: { kind: "variable_declarator" } })
		?.field("value");
	if (node == null) throw new Error("Missing test value");
	return readFixtureValue({ node, builders });
};

test("reads static literals while preserving dynamic fields and positions", () => {
	expect(
		read(
			`{ 'na\\u006de': 'a\\nb', n: -1.25, yes: true, no: false, nil: null, rows: [1, compute(), null], dynamic: value }`,
		),
	).toEqual({
		name: "a\nb",
		n: -1.25,
		yes: true,
		no: false,
		nil: null,
		rows: [1, DYNAMIC_VALUE, null],
		dynamic: DYNAMIC_VALUE,
	});
	expect(read("{ omitted: undefined }")).toEqual({ omitted: DYNAMIC_VALUE });
});

test.each([
	"{ ...value }",
	"{ [key]: 1 }",
	"{ a: 1, 'a': 2 }",
	"[1,,2]",
	"[...value]",
	"`template`",
	"compute()",
])("refuses unsafe literal %s", (source) => {
	expect(read(source)).toBe(DYNAMIC_VALUE);
});

test("unwraps only explicitly allowed single-object builders", () => {
	expect(read("[row({ id: 'one' }), other({ id: 'two' })]", ["row"])).toEqual([
		{ id: "one" },
		DYNAMIC_VALUE,
	]);
	expect(read("row(value)", ["row"])).toBe(DYNAMIC_VALUE);
	expect(read("row({}, value)", ["row"])).toBe(DYNAMIC_VALUE);
});

test("preserves dangerous-looking keys as own properties without prototype effects", () => {
	const value = read(`{ '__proto__': 'literal', constructor: 'value' }`);
	expect(Object.getOwnPropertyDescriptor(value, "__proto__")).toBeDefined();
	expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
});
