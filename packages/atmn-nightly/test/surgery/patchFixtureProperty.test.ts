import { describe, expect, test } from "bun:test";
import { patchFixtureProperty } from "../../src/surgery/patchFixtureProperty";

const patch = ({
	source,
	property,
	text,
}: {
	source: string;
	property: string;
	text: string | null;
}) =>
	patchFixtureProperty({
		source,
		builder: "plan",
		idField: "planId",
		id: "pro",
		property,
		text,
	});

describe("patchFixtureProperty", () => {
	test("overwrites a value on a one-line fixture and leaves every other byte", () => {
		const source = `const plans = [
	plan({ planId: "free", name: "Free" }),
	plan({ internalId: "prod_B", planId: "pro", name: "Pro" }),
];
`;
		expect(patch({ source, property: "planId", text: '"proNew"' })).toBe(
			`const plans = [
	plan({ planId: "free", name: "Free" }),
	plan({ internalId: "prod_B", planId: "proNew", name: "Pro" }),
];
`,
		);
	});

	test("overwrites a nested value on a multi-line fixture", () => {
		const source = `const pro = plan({
	planId: "pro",
	price: { amount: 49, interval: "month" },
});
`;
		expect(
			patch({
				source,
				property: "price",
				text: '{\n\t\tamount: 59,\n\t\tinterval: "month",\n\t}',
			}),
		).toBe(`const pro = plan({
	planId: "pro",
	price: {
		amount: 59,
		interval: "month",
	},
});
`);
	});

	test("appends a missing property in the fixture's own layout", () => {
		const oneLine = `plan({ planId: "pro", name: "Pro" })`;
		expect(patch({ source: oneLine, property: "group", text: '"core"' })).toBe(
			`plan({ planId: "pro", name: "Pro", group: "core" })`,
		);
		const multiLine = `plan({
	planId: "pro",
	name: "Pro",
})`;
		expect(
			patch({ source: multiLine, property: "group", text: '"core"' }),
		).toBe(`plan({
	planId: "pro",
	name: "Pro",
	group: "core",
})`);
	});

	test("removes a property the server no longer has", () => {
		const oneLine = `plan({ planId: "pro", group: "core", name: "Pro" })`;
		expect(patch({ source: oneLine, property: "group", text: null })).toBe(
			`plan({ planId: "pro", name: "Pro" })`,
		);
		const multiLine = `plan({
	planId: "pro",
	group: "core",
	name: "Pro",
})`;
		expect(patch({ source: multiLine, property: "group", text: null })).toBe(
			`plan({
	planId: "pro",
	name: "Pro",
})`,
		);
		expect(patch({ source: oneLine, property: "absent", text: null })).toBe(
			oneLine,
		);
	});

	test("returns null when the fixture is not there", () => {
		expect(
			patch({
				source: `plan({ planId: "free" })`,
				property: "name",
				text: '"x"',
			}),
		).toBeNull();
	});
});
