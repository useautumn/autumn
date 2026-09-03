import { expect, test } from "bun:test";
import { findFixture } from "../../src/surgery/findFixture";
import { replaceFixture } from "../../src/surgery/replaceFixture";

const configSource = `import { atmn, feature } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "seats",
			name: "Seats",
			type: "metered",
			consumable: false,
		}),
	],
});
`;

test("replaceFixture swaps exactly the call node's bytes", () => {
	const call = findFixture({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "messages",
	});
	const { start, end } = call?.range() ?? {
		start: { index: -1 },
		end: { index: -1 },
	};
	const text = `feature({
			featureId: "messages",
			name: "Messages (renamed)",
			type: "metered",
			consumable: true,
		})`;
	const output = replaceFixture({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "messages",
		text,
	});
	expect(output).not.toBeNull();
	// Byte-identical outside the replaced range.
	expect(output?.startsWith(configSource.slice(0, start.index))).toBe(true);
	expect(output?.endsWith(configSource.slice(end.index))).toBe(true);
	expect(output?.slice(start.index, start.index + text.length)).toBe(text);
});

test("idField not first is still replaced", () => {
	const source = `export const seats = feature({
	name: "Seats",
	featureId: "seats",
	type: "metered",
});
`;
	const output = replaceFixture({
		source,
		builder: "feature",
		idField: "featureId",
		id: "seats",
		text: `feature({
	featureId: "seats",
	name: "Seats (renamed)",
	type: "metered",
})`,
	});
	expect(output).toBe(`export const seats = feature({
	featureId: "seats",
	name: "Seats (renamed)",
	type: "metered",
});
`);
});

test("a $ inside the replacement text survives verbatim", () => {
	const output = replaceFixture({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "seats",
		text: `feature({ featureId: "seats", name: "50$ off", type: "metered", consumable: false })`,
	});
	expect(output).toContain('"50$ off"');
	expect(output).not.toContain('name: "Seats"');
});

test("two fixtures in one file: only the named one is touched", () => {
	const output = replaceFixture({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "seats",
		text: `feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false })`,
	});
	// The untouched fixture keeps its exact bytes.
	expect(output).toContain(
		`feature({\n\t\t\tfeatureId: "messages",\n\t\t\tname: "Messages",\n\t\t\ttype: "metered",\n\t\t\tconsumable: true,\n\t\t}),`,
	);
	expect(output).toContain(
		'feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false })',
	);
});

test("fixture not found returns null", () => {
	expect(
		replaceFixture({
			source: configSource,
			builder: "feature",
			idField: "featureId",
			id: "nope",
			text: "feature({})",
		}),
	).toBeNull();
});
