import { expect, test } from "bun:test";
import { deleteFixtureLiteral } from "../../src/surgery/deleteFixtureLiteral";

const configSource = `import { atmn, feature } from "atmn";
import { seats } from "./features";

// a comment that must survive
export default atmn({
	features: [
		seats,
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
	],
});
`;

test("deleting an inline element removes its line and trailing comma", () => {
	const output = deleteFixtureLiteral({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "messages",
	});
	expect(output?.source).toBe(`import { atmn, feature } from "atmn";
import { seats } from "./features";

// a comment that must survive
export default atmn({
	features: [
		seats,
	],
});
`);
	expect(output?.exportedName).toBeUndefined();
});

test("byte-identical outside the removed line", () => {
	const lineStart = configSource.indexOf("\t\tfeature({");
	const suffix = configSource.slice(configSource.indexOf("\t],"));
	const output = deleteFixtureLiteral({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "messages",
	});
	expect(output?.source.startsWith(configSource.slice(0, lineStart))).toBe(
		true,
	);
	expect(output?.source.endsWith(suffix)).toBe(true);
});

test("two inline fixtures: only the named one is removed", () => {
	const output = deleteFixtureLiteral({
		source: configSource.replace(
			"seats,",
			'feature({\n\t\t\tfeatureId: "seats",\n\t\t}),',
		),
		builder: "feature",
		idField: "featureId",
		id: "seats",
	});
	expect(output?.source).not.toContain('featureId: "seats"');
	expect(output?.source).toContain('featureId: "messages"');
});

test("the sole element collapses the array to []", () => {
	const source = `export default atmn({
	features: [
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
	],
});
`;
	const output = deleteFixtureLiteral({
		source,
		builder: "feature",
		idField: "featureId",
		id: "messages",
	});
	expect(output?.source).toBe("export default atmn({\n\tfeatures: [],\n});\n");
});

test("the last element without a trailing comma is removed cleanly", () => {
	const source = `export default atmn({
	features: [
		seats,
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		})
	],
});
`;
	const output = deleteFixtureLiteral({
		source,
		builder: "feature",
		idField: "featureId",
		id: "messages",
	});
	expect(output?.source).toBe(
		"export default atmn({\n\tfeatures: [\n\t\tseats,\n\t],\n});\n",
	);
});

const exportedSource = `import { feature } from "atmn";

/** seats doc comment */
export const seats = feature({
	featureId: "seats",
	name: "Seats",
	type: "metered",
	consumable: false,
});
`;

test("deleting an export strips its doc comment and the blank line, and names it", () => {
	const output = deleteFixtureLiteral({
		source: exportedSource,
		builder: "feature",
		idField: "featureId",
		id: "seats",
	});
	expect(output?.source).toBe('import { feature } from "atmn";\n');
	expect(output?.exportedName).toBe("seats");
});

test("an export without a blank line above keeps surrounding lines intact", () => {
	const source = `import { feature } from "atmn";
/** seats doc comment */
export const seats = feature({
	featureId: "seats",
});

export const other = feature({
	featureId: "other",
});
`;
	const output = deleteFixtureLiteral({
		source,
		builder: "feature",
		idField: "featureId",
		id: "seats",
	});
	expect(output?.source).toBe(`import { feature } from "atmn";

export const other = feature({
	featureId: "other",
});
`);
});

test("fixture not found returns null", () => {
	expect(
		deleteFixtureLiteral({
			source: configSource,
			builder: "feature",
			idField: "featureId",
			id: "nope",
		}),
	).toBeNull();
});
